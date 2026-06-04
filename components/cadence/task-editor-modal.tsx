"use client"

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  TASK_EDITOR_DROPDOWN_EXIT_UNMOUNT_FALLBACK_MS,
  floatingMenuTransformOrigin,
  getTaskEditorDropdownSurfaceStyle,
  handleFloatingMenuExitTransitionEnd,
  scheduleTaskEditorDropdownEnter,
  type FloatingMenuDirection,
} from "@/components/cadence/floating-menu-portal"
import { User, CornerDownLeft, Tag } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { format, startOfDay } from "date-fns"
import type { CanvasProject } from "./canvas-board"
import { getDefaultDurationMinutes } from "@/lib/calendar-preferences"

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Compact inline weekday row (Su–Sa) to match the When dropdown reference. */
const WHEN_INLINE_WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const

export const whenInlineCalendarFormatters = {
  formatWeekdayName: (weekday: Date) =>
    WHEN_INLINE_WEEKDAY_LABELS[weekday.getDay()] ?? "",
}

/** Stored on `Task`; empty string means unassigned. */
export type TaskAssignee = "" | "tazo" | "mebo"

interface TaskData {
  title: string
  notes: string
  schedule: string
  scheduledDate?: string
  tag: string
  projectId: string
  priority: string
  assignee: TaskAssignee
  startTimeMinutes?: number
  endTimeMinutes?: number
}

function getDefaultStartMinutes(): number {
  const now = new Date()
  const raw = now.getHours() * 60 + now.getMinutes()
  return Math.ceil(raw / 15) * 15
}

/** Quick When options (custom dates use `schedule: "picked"` + `scheduledDate`). */
const quickWhenOptions = [
  { value: "today", label: "Today", icon: "due-today.svg" },
  { value: "tomorrow", label: "Tomorrow", icon: "due-tomorrow.svg" },
] as const

const PICK_DATE_ICON = "/icons/due-soon.svg"

/** p-1 DropdownField / tag portal rows: rounded-lg nests inside rounded-xl shell. */
const DROPDOWN_MENU_ROW_ROUNDED = "rounded-lg"

export const priorityOptions = [
  { value: "high", label: "High", icon: "high.svg" },
  { value: "medium", label: "Medium", icon: "medium.svg" },
  { value: "low", label: "Low", icon: "low.svg" },
  { value: "none", label: "None", icon: "none.svg" },
] as const

const assigneeOptions: { value: TaskAssignee; label: string }[] = [
  { value: "", label: "Unassigned" },
  { value: "tazo", label: "Tazo" },
  { value: "mebo", label: "Mebo" },
]

function TriggerValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-sm text-text-faint transition-colors group-hover:text-text">
      {children}
    </span>
  )
}

function IconImg({ src, className }: { src: string; className?: string }) {
  return <img src={src} alt="" className={cn("h-4 w-4 shrink-0", className)} />
}

export interface TaskEditorInitialData {
  dayIndex?: number
  startTimeMinutes?: number
  endTimeMinutes?: number
  presetTag?: string
  presetSchedule?: string
  presetScheduledDate?: string
  /** When true, duration is left empty (no start/end). Used for sidebar + flows. */
  noDuration?: boolean
  presetProjectId?: string
  /** Open the When dropdown showing the inline calendar (e.g. quick add from Due soon). */
  startWhenDropdownInDateMode?: boolean
}

export interface TaskEditorSaveData extends TaskData {
  dayIndex: number
}

export interface EditingTaskData {
  id: string
  dayIndex: number
  title: string
  schedule: string
  tag: string
  projectId?: string
  priority: string
  notes: string
  assignee: TaskAssignee
  startTimeMinutes?: number
  endTimeMinutes?: number
  /** ISO string from task `schedulePickedDate` when schedule is picked; feeds date picker. */
  scheduledDate?: string
}

export function TaskEditorPanel({
  onClose,
  onSave,
  onEditSave,
  initialData,
  editingTask,
  projects,
}: {
  onClose: () => void
  onSave?: (data: TaskEditorSaveData) => void
  onEditSave?: (id: string, data: TaskEditorSaveData) => void
  initialData?: TaskEditorInitialData | null
  editingTask?: EditingTaskData | null
  projects: CanvasProject[]
}) {
  const isEditMode = !!editingTask

  const [task, setTask] = useState<TaskData>(() => {
    if (editingTask) {
      return {
        title: editingTask.title,
        notes: editingTask.notes,
        schedule: editingTask.schedule,
        scheduledDate: editingTask.scheduledDate,
        tag: editingTask.tag,
        projectId: editingTask.projectId ?? "general",
        priority: editingTask.priority,
        assignee: editingTask.assignee,
        startTimeMinutes: editingTask.startTimeMinutes,
        endTimeMinutes: editingTask.endTimeMinutes,
      }
    }
    const presetSchedule = initialData?.presetSchedule ?? "today"
    const presetScheduledDate = initialData?.presetScheduledDate
    if (initialData?.noDuration) {
      return {
        title: "",
        notes: "",
        schedule: presetSchedule,
        scheduledDate: presetScheduledDate,
        tag: initialData?.presetTag ?? "",
        projectId: initialData?.presetProjectId ?? "general",
        priority: "none",
        assignee: "",
        startTimeMinutes: undefined,
        endTimeMinutes: undefined,
      }
    }
    const start = initialData?.startTimeMinutes ?? getDefaultStartMinutes()
    const end =
      initialData?.endTimeMinutes ??
      Math.min(start + getDefaultDurationMinutes(), 24 * 60 - 15)
    return {
      title: "",
      notes: "",
      schedule: presetSchedule,
      scheduledDate: presetScheduledDate,
      tag: initialData?.presetTag ?? "",
      projectId: initialData?.presetProjectId ?? "general",
      priority: "none",
      assignee: "",
      startTimeMinutes: start,
      endTimeMinutes: end,
    }
  })
  const dayIndex = editingTask?.dayIndex ?? initialData?.dayIndex ?? new Date().getDay()

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  /** When dropdown is open: main schedule list vs inline calendar (same portal, no nested popover). */
  const [schedulePanelView, setSchedulePanelView] = useState<"options" | "calendar">("options")
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => titleRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (activeDropdown !== "schedule") {
      setSchedulePanelView("options")
    }
  }, [activeDropdown])

  useEffect(() => {
    if (initialData?.startWhenDropdownInDateMode && !editingTask) {
      setSchedulePanelView("calendar")
      setActiveDropdown("schedule")
    }
  }, [initialData, editingTask])

  const selectedPriority =
    priorityOptions.find((o) => o.value === task.priority) || priorityOptions[3]
  const selectedAssignee =
    assigneeOptions.find((o) => o.value === task.assignee) ?? assigneeOptions[0]

  const projectById = useCallback(
    (id: string) => projects.find((p) => p.id === id) ?? projects.find((p) => p.id === "general") ?? null,
    [projects]
  )

  const selectedProject = projectById(task.projectId)

  const canSubmit = task.title.trim().length > 0

  const submittingRef = useRef(false)

  /** Same path as the orange Add task / Edit task button. */
  const submitTask = useCallback(() => {
    if (!canSubmit || submittingRef.current) return
    submittingRef.current = true
    try {
      if (isEditMode && editingTask) {
        onEditSave?.(editingTask.id, { ...task, dayIndex })
      } else {
        onSave?.({ ...task, dayIndex })
      }
      onClose()
    } finally {
      submittingRef.current = false
    }
  }, [
    canSubmit,
    dayIndex,
    editingTask,
    isEditMode,
    onClose,
    onEditSave,
    onSave,
    task,
  ])

  function handleEditorRootKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter") return
    if (e.repeat) return
    if (activeDropdown != null) return
    const target = e.target as HTMLElement | null
    if (!target) return
    // Notes are a single-line `<input>` today; plain Enter saves. If this becomes a
    // multiline `<textarea>`, keep newlines on Enter and use Cmd/Ctrl+Enter to submit.
    if (target.tagName === "TEXTAREA" && !(e.metaKey || e.ctrlKey)) return
    if (!canSubmit) return
    e.preventDefault()
    submitTask()
  }

  // When: Today / Tomorrow / Pick a date (picked uses due-soon icon + formatted date)
  const isPickedDate = task.schedule === "picked" && task.scheduledDate
  const scheduleDisplayLabel =
    isPickedDate && task.scheduledDate
      ? format(new Date(task.scheduledDate), "MMM d")
      : task.schedule === "today"
        ? "Today"
        : task.schedule === "tomorrow"
          ? "Tomorrow"
          : "Pick a date"
  const scheduleIconSrc =
    task.schedule === "today"
      ? "/icons/due-today.svg"
      : task.schedule === "tomorrow"
        ? "/icons/due-tomorrow.svg"
        : PICK_DATE_ICON

  return (
    <div
      onClick={() => setActiveDropdown(null)}
      onKeyDown={handleEditorRootKeyDown}
    >
      {/* Task title */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <button className="mt-1">
            <img
              src="/icons/taskicon.svg"
              alt=""
              className="h-5 w-5 shrink-0 opacity-70"
            />
          </button>
          <div className="flex-1">
            <input
              ref={titleRef}
              type="text"
              value={task.title}
              onChange={(e) => setTask({ ...task, title: e.target.value })}
              placeholder="Task title"
              className="w-full bg-transparent text-base font-medium text-text outline-none placeholder:text-text-faint"
            />
            <input
              type="text"
              value={task.notes}
              onChange={(e) => setTask({ ...task, notes: e.target.value })}
              placeholder="Add notes"
              className="mt-1 w-full bg-transparent text-sm text-text-muted outline-none placeholder:text-text-faint/60"
            />
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="border-t border-border/50">
        {/* Schedule */}
        <FieldRow label="Due to">
          <DropdownField
            id="schedule"
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            layoutKey={schedulePanelView}
            expectedHeight={schedulePanelView === "calendar" ? 260 : 112}
            panelClassName={
              schedulePanelView === "calendar"
                ? "min-w-[236px] max-w-[min(296px,calc(100vw-2rem))] p-1.5"
                : undefined
            }
            trigger={
              <div className="group flex items-center gap-2">
                <IconImg src={scheduleIconSrc} />
                <TriggerValue>{scheduleDisplayLabel}</TriggerValue>
              </div>
            }
          >
            {schedulePanelView === "calendar" ? (
              <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                <Calendar
                  navLayout="around"
                  mode="single"
                  captionLayout="label"
                  formatters={whenInlineCalendarFormatters}
                  selected={task.scheduledDate ? new Date(task.scheduledDate) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      setTask({
                        ...task,
                        schedule: "picked",
                        scheduledDate: startOfDay(date).toISOString(),
                      })
                      setSchedulePanelView("options")
                      setActiveDropdown(null)
                    }
                  }}
                  defaultMonth={task.scheduledDate ? new Date(task.scheduledDate) : new Date()}
                  className="w-full max-w-[min(276px,calc(100vw-2rem))] !bg-transparent !p-0 [--cell-size:2rem]"
                  modifiersClassNames={{
                    today:
                      "[&_button:not([data-selected-single=true])]:bg-app-accent [&_button:not([data-selected-single=true])]:text-white [&_button:not([data-selected-single=true])]:hover:bg-app-accent/90",
                    selected:
                      "[&_button]:z-[1]",
                  }}
                  classNames={{
                    months: "flex w-full flex-col gap-0",
                    month: "relative w-full gap-1 p-0",
                    month_caption:
                      "relative mb-0 flex h-8 w-full shrink-0 items-center justify-center px-0",
                    caption_label:
                      "w-full text-center text-sm font-semibold tracking-tight text-text",
                    button_previous:
                      "absolute left-0 top-0 z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-md p-0 text-text-muted opacity-80 transition-colors hover:bg-surface-2 hover:opacity-100 aria-disabled:opacity-30",
                    button_next:
                      "absolute right-0 top-0 z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-md p-0 text-text-muted opacity-80 transition-colors hover:bg-surface-2 hover:opacity-100 aria-disabled:opacity-30",
                    month_grid: "w-full border-collapse",
                    weekdays: "mt-1.5 flex w-full justify-between",
                    weekday:
                      "inline-flex size-6 shrink-0 select-none items-center justify-center text-center text-[0.65rem] font-medium uppercase tracking-wide text-text-muted",
                    week: "mt-1.5 flex w-full justify-between",
                    day: "relative p-0 text-center text-[12px] focus-within:relative focus-within:z-20",
                    day_button:
                      "size-6 min-h-6 min-w-6 rounded-md p-0 font-normal text-text hover:bg-surface-2 data-[selected-single=true]:!bg-surface-2 data-[selected-single=true]:!text-text data-[selected-single=true]:hover:!bg-surface-2",
                    today: "bg-transparent p-0",
                    selected: "bg-transparent",
                    outside: "text-text-faint opacity-45 aria-selected:opacity-100",
                    disabled: "text-text-faint opacity-30",
                  }}
                />
              </div>
            ) : (
              <>
                {quickWhenOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setTask({
                        ...task,
                        schedule: option.value,
                        scheduledDate: undefined,
                      })
                      setActiveDropdown(null)
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-surface-2",
                      DROPDOWN_MENU_ROW_ROUNDED
                    )}
                  >
                    <IconImg src={`/icons/${option.icon}`} />
                    <span className="text-text">{option.label}</span>
                    {task.schedule === option.value && (
                      <span className="ml-auto text-text-muted">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path
                            d="M2.5 7L5.5 10L11.5 4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSchedulePanelView("calendar")
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-surface-2",
                    DROPDOWN_MENU_ROW_ROUNDED
                  )}
                >
                  <IconImg src={PICK_DATE_ICON} />
                  <span
                    className="flex-1 text-left text-text"
                  >
                    {isPickedDate && task.scheduledDate
                      ? format(new Date(task.scheduledDate), "MMM d")
                      : "Pick a date"}
                  </span>
                  {isPickedDate && (
                    <span className="ml-auto text-text-muted">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M2.5 7L5.5 10L11.5 4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                </button>
              </>
            )}
          </DropdownField>
        </FieldRow>

        {/* Project */}
        <FieldRow label="Project">
          <DropdownField
            id="project"
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            expectedHeight={Math.min(260, Math.max(112, projects.length * 34 + 10))}
            trigger={
              <div className="group flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: selectedProject?.color ?? "#94a3b8" }}
                />
                <TriggerValue>{selectedProject?.name ?? "General"}</TriggerValue>
              </div>
            }
          >
            {projects.map((p) => {
              return (
                <button
                  key={p.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setTask({ ...task, projectId: p.id })
                    setActiveDropdown(null)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-surface-2",
                    DROPDOWN_MENU_ROW_ROUNDED
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: p.color ?? "#94a3b8" }}
                  />
                  <span className="text-text">{p.name}</span>
                  {task.projectId === p.id && (
                    <span className="ml-auto text-text-muted">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M2.5 7L5.5 10L11.5 4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                </button>
              )
            })}
          </DropdownField>
        </FieldRow>

        {/* Priority */}
        <FieldRow label="Priority">
          <DropdownField
            id="priority"
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            expectedHeight={146}
            trigger={
              <div className="group flex items-center gap-2">
                <IconImg src={`/icons/${selectedPriority.icon}`} />
                <TriggerValue>{selectedPriority.label}</TriggerValue>
              </div>
            }
          >
            {priorityOptions.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.stopPropagation()
                  setTask({ ...task, priority: option.value })
                  setActiveDropdown(null)
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-surface-2",
                  DROPDOWN_MENU_ROW_ROUNDED
                )}
              >
                <IconImg src={`/icons/${option.icon}`} />
                <span className="text-text">{option.label}</span>
                {task.priority === option.value && (
                  <span className="ml-auto text-text-muted">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M2.5 7L5.5 10L11.5 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </DropdownField>
        </FieldRow>

        {/* Assignee */}
        <FieldRow label="Assignee" noBorder>
          <DropdownField
            id="assignee"
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            expectedHeight={112}
            trigger={
              <div className="group flex items-center gap-2">
                <User className="h-4 w-4 shrink-0 text-text-faint" />
                <TriggerValue>{selectedAssignee.label}</TriggerValue>
              </div>
            }
          >
            {assigneeOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setTask({ ...task, assignee: option.value })
                  setActiveDropdown(null)
                }}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-surface-2",
                  DROPDOWN_MENU_ROW_ROUNDED
                )}
              >
                <span className="text-text">{option.label}</span>
                {task.assignee === option.value && (
                  <span className="text-text-muted">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M2.5 7L5.5 10L11.5 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </DropdownField>
        </FieldRow>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end border-t border-border/50 px-6 py-3">
        <div className="flex items-center gap-2">
          {/* Discard button (4px radius) */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded border border-border/50 bg-surface px-4 py-2 text-xs font-medium text-text shadow-sm transition-[background-color,transform] duration-200 ease-out hover:bg-surface-2 active:scale-[0.97]"
          >
            Discard
            <kbd className="ml-1 rounded border border-border/50 bg-background/40 px-1.5 py-0.5 text-[10px] font-medium text-text-faint">
              ESC
            </kbd>
          </button>

          {/* Main CTA (4px radius) */}
          <button
            disabled={!canSubmit}
            onClick={submitTask}
            className={cn(
              "flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition-[background-color,box-shadow,filter,transform] duration-200 ease-out active:scale-[0.97]",
              canSubmit
                ? "bg-app-accent text-app-accent-foreground shadow-sm hover:brightness-110 hover:shadow-md"
                : "cursor-not-allowed text-text-faint opacity-50"
            )}
          >
            {isEditMode ? "Edit task" : "Add task"}
            {/* ✅ ONLY CHANGE IS HERE: match ESC badge sizing */}
            <span
              className={cn(
                "ml-1 inline-flex items-center justify-center rounded px-1.5 py-0.5 leading-none",
                canSubmit ? "border border-white/15 bg-white/2" : "border-transparent bg-transparent"
              )}
            >
              <CornerDownLeft className={cn("h-3 w-3", canSubmit ? "text-white" : "text-text-faint opacity-60")} />
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldRow({
  label,
  children,
  noBorder = false,
}: {
  label: string
  children: React.ReactNode
  noBorder?: boolean
}) {
  return (
    <div className={cn("px-6 py-3", !noBorder && "border-b border-border/50")}>
      <div className="mb-1 text-[12px] font-medium tracking-normal text-text-faint/50">
        {label}
      </div>
      {children}
    </div>
  )
}

export const SEED_TAGS = [
  { name: "Inbox", color: "#78716c" },
  { name: "Work", color: "#ef4444" },
  { name: "Family", color: "#3b82f6" },
  { name: "Personal", color: "#a855f7" },
  { name: "Travel", color: "#22c55e" },
  { name: "Reading", color: "#ef4444" },
  { name: "Building", color: "#3b82f6" },
  { name: "Portfolio", color: "#a855f7" },
  { name: "Inspiration", color: "#22c55e" },
]

function TagAutocomplete({
  value,
  onChange,
}: {
  value: string
  onChange: (tag: string) => void
}) {
  const [tags, setTags] = useState(SEED_TAGS)
  const [query, setQuery] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [tagVisible, setTagVisible] = useState(false)
  const [tagRenderPortal, setTagRenderPortal] = useState(false)
  const [tagPos, setTagPos] = useState<{ top: number; left: number } | null>(
    null
  )
  const tagExitHandledRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tagTriggerRef = useRef<HTMLDivElement>(null)
  const reducedMotionTags = useReducedMotion() ?? false

  const filtered =
    query.length > 0
      ? tags.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
      : []

  const exactMatch = tags.some((t) => t.name.toLowerCase() === query.toLowerCase())
  const showCreate = query.length > 0 && !exactMatch
  const totalItems = filtered.length + (showCreate ? 1 : 0)

  useEffect(() => {
    if (highlightIndex >= totalItems)
      setHighlightIndex(Math.max(0, totalItems - 1))
  }, [totalItems, highlightIndex])

  const suggestionsOpen = isOpen && totalItems > 0

  useEffect(() => {
    if (suggestionsOpen && tagTriggerRef.current) {
      const rect = tagTriggerRef.current.getBoundingClientRect()
      setTagPos({ top: rect.bottom + 8, left: rect.left })
      setTagRenderPortal(true)
      tagExitHandledRef.current = false
      return scheduleTaskEditorDropdownEnter(setTagVisible, reducedMotionTags)
    }
    if (reducedMotionTags) {
      setTagVisible(false)
      setTagRenderPortal(false)
      setTagPos(null)
    } else {
      setTagVisible(false)
    }
  }, [suggestionsOpen, reducedMotionTags])

  useEffect(() => {
    if (suggestionsOpen || tagVisible || !tagRenderPortal || reducedMotionTags) return
    const t = window.setTimeout(() => {
      setTagRenderPortal(false)
      setTagPos(null)
    }, TASK_EDITOR_DROPDOWN_EXIT_UNMOUNT_FALLBACK_MS)
    return () => clearTimeout(t)
  }, [suggestionsOpen, tagVisible, tagRenderPortal, reducedMotionTags])

  function selectTag(name: string) {
    setQuery(name)
    onChange(name)
    setIsOpen(false)
  }

  function createTag() {
    const trimmed = query.trim()
    if (!trimmed) return
    const colors = ["#ef4444", "#f97316", "#3b82f6", "#22c55e", "#a855f7", "#ec4899"]
    const color = colors[Math.floor(Math.random() * colors.length)]
    setTags((prev) => [...prev, { name: trimmed, color }])
    selectTag(trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen && e.key !== "Escape") return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, totalItems - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      if (highlightIndex < filtered.length) selectTag(filtered[highlightIndex].name)
      else if (showCreate) createTag()
    } else if (e.key === "Escape") {
      e.stopPropagation()
      setIsOpen(false)
    }
  }

  function clearTag(e: React.MouseEvent) {
    e.stopPropagation()
    setQuery("")
    onChange("")
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const selectedTag = value ? tags.find((t) => t.name === value) : null
  const tagMenuDirection: FloatingMenuDirection = "down"
  const tagTransformOrigin = floatingMenuTransformOrigin(tagMenuDirection)
  const tagSurfaceStyle = getTaskEditorDropdownSurfaceStyle({
    visible: tagVisible,
    direction: tagMenuDirection,
    transformOrigin: tagTransformOrigin,
    reduceMotion: reducedMotionTags,
  })

  return (
    <div ref={containerRef} onClick={(e) => e.stopPropagation()}>
      <div ref={tagTriggerRef}>
        {selectedTag ? (
          <div className="flex h-6 items-center gap-2">
            <Tag className="h-4 w-4 shrink-0" style={{ color: selectedTag.color }} />
            <span
              className="inline-flex items-center gap-2 rounded px-2.5 py-1 text-sm font-medium leading-none text-text"
              style={{ backgroundColor: hexToRgba(selectedTag.color, 0.14) }}
            >
              {selectedTag.name}
            </span>
            <button
              onClick={clearTag}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-faint transition-colors hover:bg-surface-2 hover:text-text-muted"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex h-6 items-center gap-2">
            <Tag className="h-4 w-4 shrink-0 text-text-faint" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder="Add a tag"
              onChange={(e) => {
                setQuery(e.target.value)
                setIsOpen(e.target.value.length > 0)
                setHighlightIndex(0)
              }}
              onFocus={() => {
                if (query.length > 0) setIsOpen(true)
              }}
              onBlur={(e) => {
                if (containerRef.current?.contains(e.relatedTarget as Node)) return
                setTimeout(() => setIsOpen(false), 150)
              }}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
            />
          </div>
        )}
      </div>

      {tagRenderPortal &&
        tagPos &&
        createPortal(
          <div
            className={cn(
              "fixed z-[100] min-w-[200px] rounded-xl border border-border/50 bg-background p-1 shadow-lg motion-reduce:transition-none",
              reducedMotionTags && "transition-none"
            )}
            style={{
              top: tagPos.top,
              left: tagPos.left,
              ...tagSurfaceStyle,
            }}
            onMouseDown={(e) => e.preventDefault()}
            onTransitionEnd={(e) =>
              handleFloatingMenuExitTransitionEnd(e, {
                exitHandledRef: tagExitHandledRef,
                shouldStayMounted: suggestionsOpen || tagVisible,
                onUnmount: () => {
                  setTagRenderPortal(false)
                  setTagPos(null)
                },
              })
            }
          >
            {filtered.map((tag, i) => (
              <button
                key={tag.name}
                onClick={() => selectTag(tag.name)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  DROPDOWN_MENU_ROW_ROUNDED,
                  highlightIndex === i ? "bg-surface-2" : "hover:bg-surface-2"
                )}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-text">{tag.name}</span>
              </button>
            ))}
            {showCreate && (
              <button
                onClick={createTag}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  DROPDOWN_MENU_ROW_ROUNDED,
                  highlightIndex === filtered.length
                    ? "bg-surface-2"
                    : "hover:bg-surface-2"
                )}
              >
                <img
                  src="/icons/plus.svg"
                  alt=""
                  className="h-3.5 w-3.5 shrink-0 opacity-60"
                />
                <span className="text-text-muted">
                  Create &quot;<span className="font-medium text-text">{query}</span>&quot; tag
                </span>
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}

function DropdownField({
  id,
  activeDropdown,
  setActiveDropdown,
  trigger,
  children,
  layoutKey,
  expectedHeight = 180,
  panelClassName,
}: {
  id: string
  activeDropdown: string | null
  setActiveDropdown: (id: string | null) => void
  trigger: React.ReactNode
  children: React.ReactNode
  /** When this changes while open, recomputes position (e.g. schedule list vs inline calendar). */
  layoutKey?: string
  expectedHeight?: number
  panelClassName?: string
}) {
  const isOpen = activeDropdown === id
  const triggerRef = useRef<HTMLButtonElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<{
    top?: number
    bottom?: number
    left: number
    maxHeight: number
    direction: FloatingMenuDirection
  } | null>(null)
  const [visible, setVisible] = useState(false)
  const [renderPortal, setRenderPortal] = useState(false)
  const exitHandledRef = useRef(false)
  const lockedDirectionRef = useRef<FloatingMenuDirection | null>(null)
  const hasMeasuredRef = useRef(false)
  const enterCleanupRef = useRef<(() => void) | null>(null)
  const expectedHeightRef = useRef(expectedHeight)
  expectedHeightRef.current = expectedHeight
  const reducedMotion = useReducedMotion() ?? false

  const computePlacement = useCallback((surfaceRect?: DOMRect) => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const gap = 4
    const viewportMargin = 12
    const menuHeight = surfaceRect?.height ?? expectedHeightRef.current
    const menuWidth = surfaceRect?.width ?? 200
    const availableBelow = Math.max(0, window.innerHeight - rect.bottom - gap - viewportMargin)
    const availableAbove = Math.max(0, rect.top - gap - viewportMargin)
    const bestDirection: FloatingMenuDirection =
      availableBelow >= menuHeight
        ? "down"
        : availableAbove >= menuHeight
          ? "up"
          : availableBelow >= availableAbove
            ? "down"
            : "up"

    let direction: FloatingMenuDirection
    if (lockedDirectionRef.current != null) {
      direction = lockedDirectionRef.current
    } else if (surfaceRect) {
      direction = bestDirection
      lockedDirectionRef.current = bestDirection
    } else {
      direction = bestDirection
    }

    const available = direction === "down" ? availableBelow : availableAbove
    const maxLeft = Math.max(viewportMargin, window.innerWidth - viewportMargin - menuWidth)
    const left = Math.min(Math.max(viewportMargin, rect.left), maxLeft)

    setPlacement({
      ...(direction === "down"
        ? { top: rect.bottom + gap }
        : { bottom: window.innerHeight - rect.top + gap }),
      left,
      maxHeight: available,
      direction,
    })
  }, [])

  /** Open/close lifecycle only — do not reset visibility when layout/content changes while open. */
  useEffect(() => {
    if (isOpen) {
      lockedDirectionRef.current = null
      hasMeasuredRef.current = false
      exitHandledRef.current = false
      setVisible(false)
      computePlacement()
      setRenderPortal(true)
      return () => {
        enterCleanupRef.current?.()
        enterCleanupRef.current = null
      }
    }
    enterCleanupRef.current?.()
    enterCleanupRef.current = null
    lockedDirectionRef.current = null
    hasMeasuredRef.current = false
    if (reducedMotion) {
      setVisible(false)
      setRenderPortal(false)
      setPlacement(null)
    } else {
      setVisible(false)
    }
  }, [isOpen, reducedMotion])

  useLayoutEffect(() => {
    if (!isOpen || !renderPortal || !surfaceRef.current) return

    const measureAndPlace = () => {
      if (!surfaceRef.current) return
      computePlacement(surfaceRef.current.getBoundingClientRect())
    }

    measureAndPlace()

    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true
      if (reducedMotion) {
        setVisible(true)
      } else {
        enterCleanupRef.current = scheduleTaskEditorDropdownEnter(setVisible, reducedMotion)
      }
    }

    const observer = new ResizeObserver(measureAndPlace)
    observer.observe(surfaceRef.current)
    window.addEventListener("resize", measureAndPlace)
    window.addEventListener("scroll", measureAndPlace, true)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measureAndPlace)
      window.removeEventListener("scroll", measureAndPlace, true)
    }
  }, [computePlacement, isOpen, layoutKey, renderPortal, reducedMotion])

  useEffect(() => {
    if (isOpen || visible || !renderPortal || reducedMotion) return
    const t = window.setTimeout(() => {
      setRenderPortal(false)
      setPlacement(null)
    }, TASK_EDITOR_DROPDOWN_EXIT_UNMOUNT_FALLBACK_MS)
    return () => clearTimeout(t)
  }, [isOpen, visible, renderPortal, reducedMotion])

  const menuDirection: FloatingMenuDirection = placement?.direction ?? "down"
  const transformOrigin = floatingMenuTransformOrigin(menuDirection)
  const surfaceStyle = getTaskEditorDropdownSurfaceStyle({
    visible,
    direction: menuDirection,
    transformOrigin,
    reduceMotion: reducedMotion,
  })

  function handlePanelTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    handleFloatingMenuExitTransitionEnd(e, {
      exitHandledRef,
      shouldStayMounted: isOpen || visible,
      onUnmount: () => {
        setRenderPortal(false)
        setPlacement(null)
      },
    })
  }

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation()
          setActiveDropdown(isOpen ? null : id)
        }}
        className="flex w-full items-center rounded py-0.5 transition-colors hover:bg-surface-2/50"
      >
        {trigger}
      </button>

      {renderPortal &&
        placement &&
        createPortal(
          <div
            ref={surfaceRef}
            className={cn(
              "fixed z-[100] min-w-[200px] overflow-y-auto rounded-xl border border-border/50 bg-background p-1 shadow-lg motion-reduce:transition-none",
              reducedMotion && "transition-none",
              panelClassName
            )}
            style={{
              ...(placement.direction === "down"
                ? { top: placement.top }
                : { bottom: placement.bottom }),
              left: placement.left,
              maxHeight: placement.maxHeight,
              ...surfaceStyle,
            }}
            onClick={(e) => e.stopPropagation()}
            onTransitionEnd={handlePanelTransitionEnd}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  )
}
