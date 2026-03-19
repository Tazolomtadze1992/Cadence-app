"use client"

import { useState, useMemo, useCallback } from "react"
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isToday,
} from "date-fns"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, RotateCcw, Clock } from "lucide-react"
import type { Task } from "@/app/page"
import type { CanvasProject } from "./canvas-board"

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime12(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const period = h >= 12 ? "pm" : "am"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`
}

function formatDuration(startMinutes: number, endMinutes: number): string {
  const diff = endMinutes - startMinutes
  const hours = Math.floor(diff / 60)
  const mins = diff % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ onAddTask }: { onAddTask?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg">
        <span
          className="h-6 w-6 block"
          style={{
            backgroundColor: "var(--color-text-faint)",
            WebkitMaskImage: "url(/icons/calendar.svg)",
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskImage: "url(/icons/calendar.svg)",
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
          }}
        />
      </div>
      <h3 className="mb-1.5 text-sm font-medium text-text">Nothing scheduled</h3>
      <p className="mb-4 max-w-[200px] text-center text-xs leading-relaxed text-text-muted">
        Schedule an event or task for this date and you will see it here!
      </p>
      <button
        onClick={onAddTask}
        className="rounded-lg bg-surface-2 px-4 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-3 hover:text-text"
      >
        Add task
      </button>
    </div>
  )
}

// ─── Scheduled task row (left bar, title, start time, duration) ───────────────
function ScheduledTaskRow({ task, project }: { task: Task; project: CanvasProject | null }) {
  const color = project?.color ?? task.tagColor ?? "#6b7280"
  const start = task.startMinutes!
  const end = task.endMinutes!

  return (
    <div className="relative flex w-full items-stretch gap-0 overflow-hidden rounded-md">
      <div
        className="absolute left-0 top-1/2 h-10 w-[4px] -translate-y-1/2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0 flex-1 pl-4 pr-3 py-2 flex flex-col gap-0.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text" style={{ color }}>
            {task.title}
          </p>
        </div>
        <p className="text-xs text-text-muted">{formatTime12(start)}</p>
        <p className="text-xs text-text-muted">{formatDuration(start, end)}</p>
      </div>
    </div>
  )
}

// ─── Mini Calendar ───────────────────────────────────────────────────────────
function MiniCalendar({
  selectedDate,
  onSelectDate,
  currentMonth,
  onPrevMonth,
  onNextMonth,
  onResetToToday,
}: {
  selectedDate: Date
  onSelectDate: (date: Date) => void
  currentMonth: Date
  onPrevMonth: () => void
  onNextMonth: () => void
  onResetToToday: () => void
}) {
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const weeks: Date[][] = []
  let day = calendarStart
  while (day <= calendarEnd) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = addDays(day, 1)
    }
    weeks.push(week)
  }

  const selectedWeekStart = startOfWeek(selectedDate, { weekStartsOn: 0 })

  return (
    <div className="px-3 pb-4 pt-2">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-text">
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onResetToToday}
            className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onPrevMonth}
            className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={onNextMonth}
            className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-0">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 text-center text-xs font-medium text-text-faint">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0">
        {weeks.map((week, wi) => {
          const isSelectedWeek = isSameDay(startOfWeek(week[0], { weekStartsOn: 0 }), selectedWeekStart)
          return week.map((d, di) => {
            const isCurrentMonth = isSameMonth(d, currentMonth)
            const isSelected = isSameDay(d, selectedDate)
            const isTodayDate = isToday(d)

            return (
              <button
                key={`${wi}-${di}`}
                onClick={() => onSelectDate(d)}
                className={cn(
                  "relative flex h-8 w-full items-center justify-center text-xs font-medium transition-colors",
                  isSelectedWeek && di === 0 && "rounded-l-md",
                  isSelectedWeek && di === 6 && "rounded-r-md",
                  isSelectedWeek && "bg-surface-2/50",
                  !isCurrentMonth && "text-text-faint",
                  isCurrentMonth && !isSelected && "text-text-muted hover:text-text",
                  isSelected && "text-white",
                  isTodayDate && !isSelected && "text-app-accent"
                )}
              >
                {isSelected && (
                  <span className="absolute inset-0 m-auto flex h-7 w-7 items-center justify-center rounded-md bg-app-accent" />
                )}
                <span className="relative z-10">{format(d, "d")}</span>
              </button>
            )
          })
        })}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function AgendaView({ tasks = [], projects = [] }: { tasks?: Task[]; projects?: CanvasProject[] }) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date())

  const projectById = useMemo(() => {
    const map = new Map<string, CanvasProject>()
    for (const p of projects) map.set(p.id, p)
    return map
  }, [projects])

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((prev) => subMonths(prev, 1))
  }, [])

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((prev) => addMonths(prev, 1))
  }, [])

  const handleResetToToday = useCallback(() => {
    const today = new Date()
    setSelectedDate(today)
    setCurrentMonth(today)
  }, [])

  const handleSelectDate = useCallback((date: Date) => {
    setSelectedDate(date)
    if (!isSameMonth(date, currentMonth)) {
      setCurrentMonth(date)
    }
  }, [currentMonth])

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd")

  const tasksForDay = useMemo(
    () => tasks.filter((t) => t.dueDate === selectedDateStr),
    [tasks, selectedDateStr]
  )

  const scheduledTasks = useMemo(
    () =>
      tasksForDay.filter(
        (t) =>
          t.startMinutes != null &&
          t.endMinutes != null &&
          !t.completed
      ),
    [tasksForDay]
  )

  const unscheduledTasks = useMemo(
    () =>
      tasksForDay.filter(
        (t) =>
          (t.startMinutes == null || t.endMinutes == null) &&
          !t.completed
      ),
    [tasksForDay]
  )

  const totalItems = scheduledTasks.length + unscheduledTasks.length

  return (
    <div className="flex h-full flex-col">
      <MiniCalendar
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        currentMonth={currentMonth}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onResetToToday={handleResetToToday}
      />

      {/* Date header + item count */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-base font-semibold text-text">
          {format(selectedDate, "EEE d MMM")}
        </h2>
        {totalItems > 0 && (
          <span className="text-xs text-text-muted">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {totalItems === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {scheduledTasks.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-text-faint" />
                  <span className="text-xs font-medium text-text-muted">Scheduled</span>
                </div>
                <div className="space-y-2">
                  {scheduledTasks.map((task) => (
                    <ScheduledTaskRow
                      key={task.id}
                      task={task}
                      project={projectById.get((task.projectId ?? "general").trim() || "general") ?? null}
                    />
                  ))}
                </div>
              </div>
            )}

            {unscheduledTasks.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-4 w-4 block"
                    style={{
                      backgroundColor: "var(--color-text-faint)",
                      WebkitMaskImage: "url(/icons/calendar.svg)",
                      WebkitMaskSize: "contain",
                      WebkitMaskRepeat: "no-repeat",
                      WebkitMaskPosition: "center",
                      maskImage: "url(/icons/calendar.svg)",
                      maskSize: "contain",
                      maskRepeat: "no-repeat",
                      maskPosition: "center",
                    }}
                  />
                  <span className="text-xs font-medium text-text-muted">Unscheduled</span>
                </div>
                <div className="space-y-2">
                  {unscheduledTasks.map((task) => (
                    (() => {
                      const project =
                        projectById.get((task.projectId ?? "general").trim() || "general") ?? null
                      const color = project?.color ?? task.tagColor ?? "#6b7280"
                      return (
                    <div
                      key={task.id}
                      className="relative flex w-full items-stretch gap-0 overflow-hidden rounded-md"
                    >
                      <div
                        className="absolute left-0 top-1/2 h-10 w-[4px] -translate-y-1/2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0 flex-1 pl-4 pr-3 py-2 flex flex-col gap-0.5">
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-medium"
                            style={{ color }}
                          >
                            {task.title}
                          </p>
                        </div>
                        <p className="text-xs text-text-muted">No time set</p>
                      </div>
                    </div>
                      )
                    })()
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
