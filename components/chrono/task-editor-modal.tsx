"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { User, CornerDownLeft, Tag, ChevronLeft, ChevronRight } from "lucide-react"
import {
  DayButton,
  getDefaultClassNames,
  MonthCaption,
  useDayPicker,
} from "react-day-picker"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { format, startOfDay } from "date-fns"
import type { CanvasProject } from "./canvas-board"
import {
  QUICK_WHEN_OPTIONS,
  PICK_DATE_ICON,
  formatWhenPickedDateLabel,
  whenPickRowLabel,
  whenTriggerIconSrc,
} from "./schedule-when-shared"

/** Single header row: month/year left, prev/next chevrons grouped on the right. */
export function WhenDropdownMonthCaption(
  props: React.ComponentProps<typeof MonthCaption>
) {
  const {
    calendarMonth,
    className,
    children: _ignoredCaption,
    displayIndex: _displayIndex,
    ...rest
  } = props
  const {
    previousMonth,
    nextMonth,
    goToMonth,
    labels: { labelPrevious, labelNext },
    classNames: rdpClassNames,
    dayPickerProps,
  } = useDayPicker()

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!previousMonth) return
    goToMonth(previousMonth)
    dayPickerProps.onPrevClick?.(previousMonth)
  }
  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!nextMonth) return
    goToMonth(nextMonth)
    dayPickerProps.onNextClick?.(nextMonth)
  }

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-2 pt-2 pb-2",
        className
      )}
      {...rest}
    >
      <span
        className="min-w-0 flex-1 truncate px-[10px] text-left text-[15px] font-semibold tracking-tight text-text"
        role="status"
        aria-live="polite"
      >
        {format(calendarMonth.date, "MMMM yyyy")}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className={rdpClassNames.button_previous}
          onClick={handlePrev}
          disabled={!previousMonth}
          aria-label={labelPrevious(previousMonth)}
          aria-disabled={previousMonth ? undefined : true}
        >
          <ChevronLeft className="size-3.5 opacity-80" aria-hidden />
        </button>
        <button
          type="button"
          className={rdpClassNames.button_next}
          onClick={handleNext}
          disabled={!nextMonth}
          aria-label={labelNext(nextMonth)}
          aria-disabled={nextMonth ? undefined : true}
        >
          <ChevronRight className="size-3.5 opacity-80" aria-hidden />
        </button>
      </div>
    </div>
  )
}

/** Compact inline calendar day cell: accent for today; picked date matches modal (`bg-secondary`); accent ring when today is also selected. */
export function WhenDropdownDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const { selected, today, outside, disabled } = modifiers

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        Boolean(
          selected &&
            !modifiers.range_start &&
            !modifiers.range_end &&
            !modifiers.range_middle
        )
      }
      className={cn(
        "mx-auto flex aspect-square size-auto h-[var(--cell-size)] min-h-0 min-w-0 w-[var(--cell-size)] max-w-full p-0 text-[13px] font-normal leading-none",
        "rounded-md transition-colors",
        disabled && "opacity-30",
        outside && !selected && "text-text-faint opacity-50",
        !outside && !selected && !today && "text-text hover:bg-surface-2",
        today &&
          !selected &&
          "bg-app-accent text-white hover:bg-app-accent hover:text-white",
        selected &&
          "bg-secondary text-secondary-foreground hover:bg-secondary/90 hover:text-secondary-foreground",
        today && selected && "ring-2 ring-inset ring-app-accent",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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

const priorityOptions = [
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
    const end = initialData?.endTimeMinutes ?? Math.min(start + 60, 24 * 60 - 15)
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

  // When: Today / Tomorrow / Pick a date (picked uses due-soon icon + formatted date)
  const isPickedDate = task.schedule === "picked" && task.scheduledDate
  const scheduleDisplayLabel =
    task.schedule === "picked" && task.scheduledDate
      ? formatWhenPickedDateLabel(task.scheduledDate)
      : task.schedule === "today"
        ? "Today"
        : task.schedule === "tomorrow"
          ? "Tomorrow"
          : whenPickRowLabel(task.schedule, task.scheduledDate)
  const scheduleIconSrc = whenTriggerIconSrc(task.schedule)

  return (
    <div onClick={() => setActiveDropdown(null)}>
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
        <FieldRow label="When">
          <DropdownField
            id="schedule"
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            openUp
            layoutKey={schedulePanelView}
            panelClassName={
              schedulePanelView === "calendar"
                ? "min-w-[248px] max-w-[min(280px,calc(100vw-2rem))] p-0"
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
              <Calendar
                mode="single"
                hideNavigation
                captionLayout="label"
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
                buttonVariant="ghost"
                className="w-full max-w-[260px] rounded-lg bg-transparent p-0 [--cell-size:1.5rem]"
                components={{
                  MonthCaption: WhenDropdownMonthCaption,
                  DayButton: WhenDropdownDayButton,
                }}
                classNames={{
                  root: "w-full",
                  months: "flex w-full flex-col gap-0",
                  month:
                    "flex w-full flex-col gap-0 px-4 pb-5 [&_[role=grid]]:w-full",
                  month_caption: "w-full min-w-0",
                  button_previous:
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-md p-0 text-text-muted transition-colors hover:bg-surface-2 hover:text-text",
                  button_next:
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-md p-0 text-text-muted transition-colors hover:bg-surface-2 hover:text-text",
                  month_grid:
                    "mt-2 w-full min-w-0 table-fixed border-collapse",
                  weekdays: "w-full",
                  weekday:
                    "h-8 w-[14.285714%] p-0 text-center align-middle text-[12px] font-normal text-text-muted select-none",
                  weeks: "w-full",
                  week: "w-full h-[2.25rem]",
                  day: "w-[14.285714%] p-0 text-center align-middle text-[13px] focus-within:relative focus-within:z-20",
                  day_button: "font-normal",
                  today: "bg-transparent",
                  selected: "bg-transparent",
                  outside: "text-text-faint opacity-50",
                  disabled: "opacity-30",
                }}
              />
            ) : (
              <>
                {QUICK_WHEN_OPTIONS.map((option) => (
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
                    className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2"
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
                  className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2"
                >
                  <IconImg src={PICK_DATE_ICON} />
                  <span
                    className="flex-1 text-left text-text"
                  >
                    {whenPickRowLabel(task.schedule, task.scheduledDate)}
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
            openUp
            trigger={
              <div className="group flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: selectedProject?.color ?? "#94a3b8" }}
                />
                <TriggerValue>{selectedProject?.name ?? "Daily Banking"}</TriggerValue>
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
                  className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2"
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
            openUp
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
                className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2"
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
            openUp
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
                className="flex w-full items-center justify-between rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2"
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
            className="flex items-center gap-1.5 rounded border border-border/50 bg-surface-2 px-4 py-2 text-xs font-medium text-text shadow-sm transition-colors hover:bg-surface"
          >
            Discard
            <kbd className="ml-1 rounded border border-border/50 bg-background/40 px-1.5 py-0.5 text-[10px] font-medium text-text-faint">
              ESC
            </kbd>
          </button>

          {/* Main CTA (4px radius) */}
          <button
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return
              if (isEditMode && editingTask) {
                onEditSave?.(editingTask.id, { ...task, dayIndex })
              } else {
                onSave?.({ ...task, dayIndex })
              }
              onClose()
            }}
            className={cn(
              "flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition-all",
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
  const [tagPos, setTagPos] = useState<{ top: number; left: number } | null>(
    null
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tagTriggerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (isOpen && tagTriggerRef.current) {
      const rect = tagTriggerRef.current.getBoundingClientRect()
      setTagPos({ top: rect.bottom + 8, left: rect.left })
      requestAnimationFrame(() => setTagVisible(true))
    } else {
      setTagVisible(false)
    }
  }, [isOpen])

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

      {isOpen &&
        totalItems > 0 &&
        tagPos &&
        createPortal(
          <div
            className="fixed z-[100] min-w-[240px] rounded-xl border border-border/50 bg-background p-1 shadow-lg motion-reduce:transition-none"
            style={{
              top: tagPos.top,
              left: tagPos.left,
              opacity: tagVisible ? 1 : 0,
              transform: tagVisible
                ? "translateY(0) scale(1)"
                : "translateY(-4px) scale(0.98)",
              transition: tagVisible
                ? "opacity 150ms ease-out, transform 150ms ease-out"
                : "opacity 100ms ease-in, transform 100ms ease-in",
              transformOrigin: "top left",
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {filtered.map((tag, i) => (
              <button
                key={tag.name}
                onClick={() => selectTag(tag.name)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors",
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
                  "flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors",
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
  openUp = false,
  layoutKey,
  panelClassName,
}: {
  id: string
  activeDropdown: string | null
  setActiveDropdown: (id: string | null) => void
  trigger: React.ReactNode
  children: React.ReactNode
  openUp?: boolean
  /** When this changes while open, recomputes position (e.g. schedule list vs inline calendar). */
  layoutKey?: string
  panelClassName?: string
}) {
  const isOpen = activeDropdown === id
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [visible, setVisible] = useState(false)

  const computePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const gap = 4
    if (openUp) setPos({ top: rect.top - gap, left: rect.left })
    else setPos({ top: rect.bottom + gap, left: rect.left })
  }, [openUp])

  useEffect(() => {
    if (isOpen) {
      computePos()
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [isOpen, computePos, layoutKey])

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

      {isOpen &&
        pos &&
        createPortal(
          <div
            className={cn(
              "fixed z-[100] min-w-[240px] rounded-xl border border-border/50 bg-background p-1 shadow-lg motion-reduce:transition-none",
              panelClassName
            )}
            style={{
              left: pos.left,
              ...(openUp
                ? { bottom: `calc(100vh - ${pos.top}px)` }
                : { top: pos.top }),
              opacity: visible ? 1 : 0,
              transform: visible
                ? "translateY(0) scale(1)"
                : openUp
                  ? "translateY(4px) scale(0.98)"
                  : "translateY(-4px) scale(0.98)",
              transition: visible
                ? "opacity 150ms ease-out, transform 150ms ease-out"
                : "opacity 100ms ease-in, transform 100ms ease-in",
              transformOrigin: openUp ? "bottom left" : "top left",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  )
}
