"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { Tag, Repeat, CornerDownLeft, Clock, ArrowRight } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { format, startOfDay } from "date-fns"
import type { CanvasProject } from "./canvas-board"

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface TaskData {
  title: string
  schedule: string
  scheduledDate?: string
  tag: string
  projectId: string
  priority: string
  repeat: string
  startTimeMinutes?: number
  endTimeMinutes?: number
}

function formatTime12(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const period = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`
}

function formatTime12Optional(minutes: number | undefined): string {
  return minutes != null ? formatTime12(minutes) : "No duration"
}

function formatDuration(diffMinutes: number): string {
  const hours = Math.floor(diffMinutes / 60)
  const mins = diffMinutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

function getDefaultStartMinutes(): number {
  const now = new Date()
  const raw = now.getHours() * 60 + now.getMinutes()
  return Math.ceil(raw / 15) * 15
}

const ALL_TIME_SLOTS = Array.from({ length: 96 }, (_, i) => i * 15)

function ScrollToSelected({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const selected = container.querySelector("[data-selected='true']") as
      | HTMLElement
      | null
    selected?.scrollIntoView({ block: "center" })
  }, [containerRef])
  return null
}

const scheduleOptions = [
  { value: "anytime", label: "Anytime", icon: null },
  { value: "today", label: "Today", icon: "due-today.svg" },
  { value: "tomorrow", label: "Tomorrow", icon: "due-tomorrow.svg" },
  { value: "next-week", label: "Next week", icon: "due-soon.svg" },
] as const

const priorityOptions = [
  { value: "high", label: "High", icon: "high.svg" },
  { value: "medium", label: "Medium", icon: "medium.svg" },
  { value: "low", label: "Low", icon: "low.svg" },
  { value: "none", label: "None", icon: "none.svg" },
] as const

const repeatOptions = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday", detail: "Mon – Fri" },
  { value: "weekly", label: "Every week", detail: "on Wed" },
  { value: "biweekly", label: "Every 2 weeks", detail: "on Wed" },
  { value: "monthly-date", label: "Every month", detail: "on the 18th" },
  { value: "monthly-day", label: "Every month", detail: "on the 3rd Wed" },
  { value: "monthly-last", label: "Every month", detail: "on the last Wed" },
  { value: "yearly", label: "Every year", detail: "on Feb 18" },
  { value: "custom", label: "Custom..." },
] as const

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
  repeat: string
  startTimeMinutes?: number
  endTimeMinutes?: number
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
        schedule: editingTask.schedule,
        tag: editingTask.tag,
        projectId: editingTask.projectId ?? "general",
        priority: editingTask.priority,
        repeat: editingTask.repeat,
        startTimeMinutes: editingTask.startTimeMinutes,
        endTimeMinutes: editingTask.endTimeMinutes,
      }
    }
    const presetSchedule = initialData?.presetSchedule ?? "anytime"
    const presetScheduledDate = initialData?.presetScheduledDate
    if (initialData?.noDuration) {
      return {
        title: "",
        schedule: presetSchedule,
        scheduledDate: presetScheduledDate,
        tag: initialData?.presetTag ?? "",
        projectId: initialData?.presetProjectId ?? "general",
        priority: "none",
        repeat: "none",
        startTimeMinutes: undefined,
        endTimeMinutes: undefined,
      }
    }
    const start = initialData?.startTimeMinutes ?? getDefaultStartMinutes()
    const end = initialData?.endTimeMinutes ?? Math.min(start + 60, 24 * 60 - 15)
    return {
      title: "",
      schedule: presetSchedule,
      scheduledDate: presetScheduledDate,
      tag: initialData?.presetTag ?? "",
      projectId: initialData?.presetProjectId ?? "general",
      priority: "none",
      repeat: "none",
      startTimeMinutes: start,
      endTimeMinutes: end,
    }
  })
  const dayIndex = editingTask?.dayIndex ?? initialData?.dayIndex ?? new Date().getDay()

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => titleRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [])

  const selectedSchedule =
    scheduleOptions.find((o) => o.value === task.schedule) || scheduleOptions[0]
  const selectedPriority =
    priorityOptions.find((o) => o.value === task.priority) || priorityOptions[3]
  const selectedRepeat =
    repeatOptions.find((o) => o.value === task.repeat) || repeatOptions[0]

  const projectById = useCallback(
    (id: string) => projects.find((p) => p.id === id) ?? projects.find((p) => p.id === "general") ?? null,
    [projects]
  )

  const selectedProject = projectById(task.projectId)

  const startScrollRef = useRef<HTMLDivElement>(null)
  const endScrollRef = useRef<HTMLDivElement>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const datePickerRef = useRef<HTMLDivElement>(null)

  // Close date picker on outside click
  useEffect(() => {
    if (!showDatePicker) return
    const handleClick = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [showDatePicker])

  const canSubmit = task.title.trim().length > 0

  // Compute schedule display label and icon
  const isPickedDate = task.schedule === "picked" && task.scheduledDate
  const scheduleDisplayLabel = isPickedDate && task.scheduledDate
    ? format(new Date(task.scheduledDate), "MMM d")
    : selectedSchedule.label
  const scheduleIconSrc = isPickedDate
    ? "/icons/calendar.svg"
    : selectedSchedule.value === "anytime"
      ? "/icons/calendar.svg"
      : `/icons/${selectedSchedule.icon}`

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
              placeholder="Add notes"
              className="mt-1 w-full bg-transparent text-sm text-text-muted outline-none placeholder:text-text-faint/60"
            />
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="border-t border-border/50">
        {/* Schedule */}
        <FieldRow label="Schedule">
          <DropdownField
            id="schedule"
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            trigger={
              <div className="group flex items-center gap-2">
                <IconImg
                  src={scheduleIconSrc}
                  className={cn(
                    selectedSchedule.value === "anytime" && "opacity-70"
                  )}
                />
                <TriggerValue>{scheduleDisplayLabel}</TriggerValue>
              </div>
            }
          >
            {scheduleOptions.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.stopPropagation()
                  setTask({ ...task, schedule: option.value })
                  setActiveDropdown(null)
                }}
                className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2"
              >
                <IconImg
                  src={
                    option.value === "anytime"
                      ? "/icons/calendar.svg"
                      : `/icons/${option.icon}`
                  }
                  className={cn(option.value === "anytime" && "opacity-70")}
                />
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
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDatePicker(true)
                }}
                className="flex w-full items-center rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2"
              >
                <span className={isPickedDate ? "text-text" : "text-text-muted"}>
                  {isPickedDate ? scheduleDisplayLabel : "Pick a date..."}
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
              {showDatePicker && (
                <div
                  ref={datePickerRef}
                  className="absolute left-0 top-full z-50 mt-1 rounded-xl border border-border/50 bg-background p-0 shadow-lg"
                >
                  <Calendar
                    mode="single"
                    selected={task.scheduledDate ? new Date(task.scheduledDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setTask({
                          ...task,
                          schedule: "picked",
                          scheduledDate: startOfDay(date).toISOString(),
                        })
                        setShowDatePicker(false)
                        setActiveDropdown(null)
                      }
                    }}
                    defaultMonth={task.scheduledDate ? new Date(task.scheduledDate) : new Date()}
                    className="rounded-xl"
                    classNames={{
                      months: "flex flex-col",
                      month: "space-y-2",
                      caption: "flex justify-center pt-1 relative items-center",
                      caption_label: "text-sm font-medium text-text",
                      nav: "space-x-1 flex items-center",
                      nav_button: "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 text-text-muted",
                      nav_button_previous: "absolute left-1",
                      nav_button_next: "absolute right-1",
                      table: "w-full border-collapse",
                      head_row: "flex",
                      head_cell: "text-text-muted rounded-md w-8 font-normal text-[0.75rem]",
                      row: "flex w-full mt-1",
                      cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                      day: "h-8 w-8 p-0 font-normal text-text hover:bg-surface-2 rounded-md transition-colors",
                      day_selected: "bg-app-accent text-white hover:bg-app-accent hover:text-white",
                      day_today: "bg-surface-2 text-text font-medium",
                      day_outside: "text-text-faint opacity-50",
                      day_disabled: "text-text-faint opacity-30",
                    }}
                  />
                </div>
              )}
            </div>
          </DropdownField>
        </FieldRow>

        {/* Duration */}
        <FieldRow label="Duration">
          <div className="flex items-center gap-3 py-0.5">
            <DropdownField
              id="start-time"
              activeDropdown={activeDropdown}
              setActiveDropdown={setActiveDropdown}
              openUp
              trigger={
                <div className="group flex items-center gap-2">
                  <Clock className="h-4 w-4 text-text-faint" />
                  <TriggerValue>{formatTime12Optional(task.startTimeMinutes)}</TriggerValue>
                </div>
              }
            >
              <div ref={startScrollRef} className="max-h-[220px] overflow-y-auto">
                <ScrollToSelected containerRef={startScrollRef} />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setTask({ ...task, startTimeMinutes: undefined, endTimeMinutes: undefined })
                    setActiveDropdown(null)
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2",
                    task.startTimeMinutes == null && "bg-surface-2/50"
                  )}
                >
                  <span className={task.startTimeMinutes == null ? "text-text" : "text-text-muted"}>No duration</span>
                  {task.startTimeMinutes == null && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-text-muted">
                      <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                {ALL_TIME_SLOTS.map((slot) => {
                  const start = task.startTimeMinutes ?? 0
                  const currentDuration = (task.endTimeMinutes ?? start) - start
                  const newEnd = Math.min(slot + (currentDuration > 0 ? currentDuration : 60), 24 * 60 - 15)
                  const clampedEnd = newEnd <= slot ? slot + 15 : newEnd
                  return (
                  <button
                    key={slot}
                    data-selected={task.startTimeMinutes === slot}
                    onClick={(e) => {
                      e.stopPropagation()
                      setTask({
                        ...task,
                        startTimeMinutes: slot,
                        endTimeMinutes: Math.min(clampedEnd, 24 * 60 - 15),
                      })
                      setActiveDropdown(null)
                    }}
                    className="flex w-full items-center justify-between rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2"
                  >
                    <span className="text-text">{formatTime12(slot)}</span>
                    {task.startTimeMinutes === slot && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        className="text-text-muted"
                      >
                        <path
                          d="M2.5 7L5.5 10L11.5 4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                  )
                })}
              </div>
            </DropdownField>

            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-faint" />

            <DropdownField
              id="end-time"
              activeDropdown={activeDropdown}
              setActiveDropdown={setActiveDropdown}
              openUp
              trigger={
                <div className="group flex items-center">
                  <TriggerValue>{task.endTimeMinutes != null ? formatTime12(task.endTimeMinutes) : "—"}</TriggerValue>
                </div>
              }
            >
              <div ref={endScrollRef} className="max-h-[220px] overflow-y-auto">
                <ScrollToSelected containerRef={endScrollRef} />
                {task.startTimeMinutes == null ? (
                  <p className="px-3 py-2 text-xs text-text-faint">Pick start time first</p>
                ) : (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setTask({ ...task, startTimeMinutes: undefined, endTimeMinutes: undefined })
                        setActiveDropdown(null)
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2",
                        task.endTimeMinutes == null && "bg-surface-2/50"
                      )}
                    >
                      <span className={task.endTimeMinutes == null ? "text-text" : "text-text-muted"}>No duration</span>
                      {task.endTimeMinutes == null && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-text-muted">
                          <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    {ALL_TIME_SLOTS.filter((slot) => task.startTimeMinutes != null && slot > task.startTimeMinutes).map((slot) => {
                      const diff = slot - (task.startTimeMinutes ?? 0)
                      return (
                        <button
                          key={slot}
                          data-selected={task.endTimeMinutes === slot}
                          onClick={(e) => {
                            e.stopPropagation()
                            setTask({ ...task, endTimeMinutes: slot })
                            setActiveDropdown(null)
                          }}
                          className="flex w-full items-center justify-between rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2"
                        >
                          <span className="text-text">{formatTime12(slot)}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-text-faint">({formatDuration(diff)})</span>
                            {task.endTimeMinutes === slot && (
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-text-muted">
                                <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            </DropdownField>
          </div>
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

        {/* Repeat */}
        <FieldRow label="Repeat" noBorder>
          <DropdownField
            id="repeat"
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            openUp
            trigger={
              <div className="group flex items-center gap-2">
                <Repeat className="h-4 w-4 text-text-faint" />
                <TriggerValue>{selectedRepeat.label}</TriggerValue>
              </div>
            }
          >
            {repeatOptions.map((option) => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.stopPropagation()
                  setTask({ ...task, repeat: option.value })
                  setActiveDropdown(null)
                }}
                className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-xs transition-colors hover:bg-surface-2"
              >
                <span className="text-text">{option.label}</span>
                <span className="flex items-center gap-2">
                  {"detail" in option && option.detail && (
                    <span className="text-xs text-text-faint">{option.detail}</span>
                  )}
                  {task.repeat === option.value && (
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
                </span>
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
      <div className="mb-1 text-[10px] font-medium tracking-normal text-text-faint/50">
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
}: {
  id: string
  activeDropdown: string | null
  setActiveDropdown: (id: string | null) => void
  trigger: React.ReactNode
  children: React.ReactNode
  openUp?: boolean
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
  }, [isOpen, computePos])

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
            className="fixed z-[100] min-w-[240px] rounded-xl border border-border/50 bg-background p-1 shadow-lg motion-reduce:transition-none"
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
