"use client"

import { useState, useCallback, useMemo } from "react"
import { startOfWeek, addDays, addWeeks, startOfDay, format } from "date-fns"
import { AppSidebar } from "@/components/chrono/sidebar"
import { TopBar } from "@/components/chrono/top-bar"
import { AccountPanel } from "@/components/chrono/account-panel"
import { CalendarGrid } from "@/components/chrono/calendar-grid"
import { CommandBar } from "@/components/chrono/command-bar"
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
  priority: string
  repeat: string
  schedule: string
  completed: boolean
  dueDate: string // ISO date string for easy comparison
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

  const weekStart = useMemo(() => startOfWeek(anchorDate, { weekStartsOn: 0 }), [anchorDate])

  const handleGoToDate = useCallback((date: Date) => {
    setAnchorDate(startOfDay(date))
  }, [])

  const handleGoToToday = useCallback(() => {
    setAnchorDate(new Date())
  }, [])

  const handleSidebarQuickAdd = useCallback(
    (preset: { tag?: string; date?: Date; schedule?: string }) => {
      if (preset.date) {
        const d = startOfDay(preset.date)
        setAnchorDate(d)
        setPendingOpen({
          dayIndex: d.getDay(),
          presetTag: preset.tag,
          presetSchedule: preset.schedule,
          presetScheduledDate: preset.schedule === "picked" ? d.toISOString() : undefined,
          noDuration: true,
        })
        return
      }

      // Tag-only quick add: keep current week context; editor will default day to "today". No duration preselected.
      setPendingOpen({
        presetTag: preset.tag,
        presetSchedule: preset.schedule,
        noDuration: true,
      })
    },
    []
  )

  const handlePrevWeek = useCallback(() => {
    setAnchorDate((prev) => addWeeks(prev, -1))
  }, [])

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
      priority: t.priority,
      repeat: t.repeat,
      startTimeMinutes: t.startMinutes,
      endTimeMinutes: t.endMinutes,
    })
  }, [tasks])

  const handleEditSave = useCallback((id: string, data: TaskEditorSaveData) => {
    const tagEntry = SEED_TAGS.find((t) => t.name === data.tag)
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
              tag: data.tag,
              tagColor: tagEntry?.color ?? t.tagColor,
              priority: data.priority,
              repeat: data.repeat,
              schedule: data.schedule,
              dueDate,
            }
          : t
      )
    )
    setEditingTask(null)
  }, [weekStart])

  const handleEditDone = useCallback(() => {
    setEditingTask(null)
  }, [])

  const handleTaskSave = useCallback((data: TaskEditorSaveData) => {
    const tagEntry = SEED_TAGS.find((t) => t.name === data.tag)
    const dueDate = format(addDays(weekStart, data.dayIndex), "yyyy-MM-dd")
    setTasks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        dayIndex: data.dayIndex,
        startMinutes: data.startTimeMinutes,
        endMinutes: data.endTimeMinutes,
        title: data.title || "New Task",
        tag: data.tag,
        tagColor: tagEntry?.color ?? "#6b7280",
        priority: data.priority,
        repeat: data.repeat,
        schedule: data.schedule,
        completed: false,
        dueDate,
      },
    ])
  }, [weekStart])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* TopBar: full width, pinned top */}
      <TopBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        onAvatarClick={() => setAccountPanelOpen(true)}
      />

      <AccountPanel open={accountPanelOpen} onClose={() => setAccountPanelOpen(false)} />

      {/* Content: sidebar + calendar side by side */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          tasks={tasks}
          onToggleComplete={handleToggleComplete}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onQuickAddTask={handleSidebarQuickAdd}
          onDragTaskStart={setDraggingSidebarTask}
          onDragTaskEnd={() => setDraggingSidebarTask(null)}
        />

        {/* Calendar area */}
        <div className="relative flex flex-1 flex-col min-w-0 overflow-hidden rounded-tl-lg bg-calendar-bg shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]">
          <CalendarGrid
            onDragCreate={handleDragCreate}
            onEventMove={handleEventMove}
            onEventResize={handleEventResize}
            onEventDoubleClick={handleEventDoubleClick}
            onSidebarTaskDrop={handleSidebarTaskDrop}
            externalEvents={tasks}
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
          />
        </div>
      </div>
    </div>
  )
}
