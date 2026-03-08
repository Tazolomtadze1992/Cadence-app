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
import { ChevronLeft, ChevronRight, RotateCcw, MoreHorizontal, Repeat, Tag, Calendar } from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────
type AgendaTask = {
  id: string
  title: string
  date: string // ISO yyyy-MM-dd
  startMinutes?: number
  endMinutes?: number
  tagColor?: string
  repeat?: boolean
  priority?: "low" | "med" | "high"
  completed?: boolean
}

// ─── Mock Data ───────────────────────────────────────────────────────────────
const MOCK_TASKS: AgendaTask[] = [
  {
    id: "1",
    title: "Example",
    date: "2026-02-27",
    tagColor: "#a855f7",
    repeat: true,
    priority: "high",
    completed: false,
  },
  {
    id: "2",
    title: "example 2",
    date: "2026-02-27",
    tagColor: "#a855f7",
    priority: "med",
    completed: false,
  },
  {
    id: "3",
    title: "Morning standup",
    date: "2026-02-26",
    startMinutes: 9 * 60,
    endMinutes: 9 * 60 + 30,
    tagColor: "#3b82f6",
    completed: false,
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

// ─── Priority Icon ───────────────────────────────────────────────────────────
function PriorityIcon({ priority }: { priority: "low" | "med" | "high" }) {
  return (
    <div className="flex h-5 w-5 items-center justify-center rounded bg-surface-2">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="3" cy="6" r="1.5" fill={priority === "high" ? "#f97316" : "#6b7280"} />
        <circle cx="9" cy="6" r="1.5" fill={priority === "high" ? "#f97316" : "#6b7280"} />
        <circle cx="6" cy="3" r="1.5" fill={priority !== "low" ? "#f97316" : "#6b7280"} />
        <circle cx="6" cy="9" r="1.5" fill="#6b7280" />
      </svg>
    </div>
  )
}

// ─── Task Row ────────────────────────────────────────────────────────────────
function TaskRow({
  task,
  onToggle,
}: {
  task: AgendaTask
  onToggle: (id: string) => void
}) {
  const hasTime = task.startMinutes !== undefined && task.endMinutes !== undefined

  return (
    <div className="group/task flex w-full items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2/50">
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task.id)}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          task.completed
            ? "border-app-accent bg-app-accent"
            : "border-text-faint hover:border-text-muted"
        )}
      >
        {task.completed && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5L4 7L8 3"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm font-medium",
              task.completed ? "text-text-muted line-through" : "text-text"
            )}
          >
            {task.title}
          </span>
          {hasTime && (
            <span className="shrink-0 text-xs text-text-muted">
              {formatTime(task.startMinutes!)}–{formatTime(task.endMinutes!)}
            </span>
          )}
        </div>

        {/* Icon chips */}
        <div className="flex items-center gap-1.5">
          {task.tagColor && (
            <div
              className="flex h-5 w-5 items-center justify-center rounded"
              style={{ backgroundColor: `color-mix(in srgb, ${task.tagColor} 20%, transparent)` }}
            >
              <Tag className="h-3 w-3" style={{ color: task.tagColor }} />
            </div>
          )}
          {task.repeat && (
            <div className="flex h-5 w-5 items-center justify-center rounded bg-surface-2">
              <Repeat className="h-3 w-3 text-text-muted" />
            </div>
          )}
          {task.priority && <PriorityIcon priority={task.priority} />}
        </div>
      </div>

      {/* More button */}
      <button className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-faint opacity-0 transition-all hover:bg-surface-2 hover:text-text-muted group-hover/task:opacity-100">
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ onAddTask }: { onAddTask?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-2">
        <Calendar className="h-6 w-6 text-text-faint" />
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

  // Build weeks
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

  // Check if selected date's week
  const selectedWeekStart = startOfWeek(selectedDate, { weekStartsOn: 0 })

  return (
    <div className="px-3 pb-4 pt-2">
      {/* Header */}
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

      {/* Weekday labels */}
      <div className="mb-1 grid grid-cols-7 gap-0">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 text-center text-xs font-medium text-text-faint">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
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
                  // Week highlight
                  isSelectedWeek && di === 0 && "rounded-l-md",
                  isSelectedWeek && di === 6 && "rounded-r-md",
                  isSelectedWeek && "bg-surface-2/50",
                  // Day states
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
export function AgendaView() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date())
  const [tasks, setTasks] = useState<AgendaTask[]>(MOCK_TASKS)

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
    // Also update month view if needed
    if (!isSameMonth(date, currentMonth)) {
      setCurrentMonth(date)
    }
  }, [currentMonth])

  const handleToggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    )
  }, [])

  // Filter tasks for selected date
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd")
  const filteredTasks = useMemo(
    () => tasks.filter((t) => t.date === selectedDateStr),
    [tasks, selectedDateStr]
  )

  // Separate scheduled vs anytime tasks
  const scheduledTasks = filteredTasks.filter((t) => t.startMinutes !== undefined)
  const anytimeTasks = filteredTasks.filter((t) => t.startMinutes === undefined)

  return (
    <div className="flex h-full flex-col">
      {/* Mini Calendar */}
      <MiniCalendar
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        currentMonth={currentMonth}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onResetToToday={handleResetToToday}
      />

      {/* Divider */}
      <div className="mx-3 h-px bg-border/30" />

      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-4">
        <h2 className="text-base font-semibold text-text">
          {format(selectedDate, "EEE d MMM")}
        </h2>
        {filteredTasks.length > 0 && (
          <span className="text-xs text-text-muted">
            {filteredTasks.length} item{filteredTasks.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Task list or empty state */}
      <div className="flex-1 overflow-y-auto px-2">
        {filteredTasks.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {/* Anytime section */}
            {anytimeTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-2 pb-2">
                  <div className="flex h-5 w-5 items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" className="text-text-faint" />
                      <circle cx="8" cy="8" r="2" fill="currentColor" className="text-text-faint" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-text-muted">Anytime</span>
                </div>
                {anytimeTasks.map((task) => (
                  <TaskRow key={task.id} task={task} onToggle={handleToggleTask} />
                ))}
              </div>
            )}

            {/* Scheduled tasks */}
            {scheduledTasks.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={handleToggleTask} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
