"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { startOfWeek, addDays, isToday, getDate, format } from "date-fns"
import {
  Check,
  Clock,
  Calendar,
  User,
  Folder,
  Sparkles,
  FileText,
  Star,
  BookOpen,
  Layout,
  Image as ImageIcon,
} from "lucide-react"
import { PriorityIcon } from "@/components/chrono/sidebar"
import { formatAssigneeLabel } from "@/components/chrono/assignee-utils"
import type { TaskAssignee } from "@/components/chrono/task-editor-modal"
import { cn } from "@/lib/utils"

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const START_HOUR = 7
const END_HOUR = 22
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => i + START_HOUR)
const HOUR_HEIGHT = 80
const MIN_MINUTES = START_HOUR * 60
const MAX_MINUTES = END_HOUR * 60
const SNAP = 15

function formatHour(hour: number) {
  if (hour === 0) return "12AM"
  if (hour < 12) return `${hour}AM`
  if (hour === 12) return "12PM"
  return `${hour - 12}PM`
}

function formatTime12(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const period = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`
}

function snapTo15(minutes: number): number {
  return Math.round(minutes / SNAP) * SNAP
}

function clampMinutes(minutes: number): number {
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, minutes))
}

interface CalendarEvent {
  id: string
  dayIndex: number
  startMinutes?: number
  endMinutes?: number
  title: string
  tagColor?: string
  tag?: string
  priority?: string
  projectName?: string
  /** When true, checkbox shows checked (calendar grid normally omits completed tasks). */
  completed?: boolean
  /** Optional note from task model (shown in hover popover when set). */
  notes?: string
  /** From task model; drives popover assignee row. */
  assignee?: TaskAssignee
}

type DragState =
  | { type: "create"; dayIndex: number; anchorMinutes: number; currentMinutes: number }
  | { type: "move"; eventId: string; dayIndex: number; startMinutes: number; endMinutes: number; offsetMinutes: number }
  | { type: "resize"; eventId: string; dayIndex: number; startMinutes: number; endMinutes: number }

function formatDuration(diffMinutes: number): string {
  const hours = Math.floor(diffMinutes / 60)
  const mins = diffMinutes % 60
  if (hours === 0) return `${mins}min`
  if (mins === 0) return `${hours}hr`
  return `${hours}hr ${mins}min`
}

function formatTime12Short(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const period = h >= 12 ? "pm" : "am"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, "0")}${period}`
}

interface HoverState {
  eventId: string
  zone: "top" | "bottom"
}

type PopoverState = {
  eventId: string
  pos: { top: number; left: number }
  visible: boolean
} | null

const ZONE_THRESHOLD = 0.65
const POPOVER_HIDE_MS = 300

function getEventPosition(startMinutes: number, endMinutes: number) {
  const minutesFromStart = startMinutes - MIN_MINUTES
  const top = (minutesFromStart / 60) * HOUR_HEIGHT
  const height = ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT
  return { top, height }
}

function getCreateRange(drag: Extract<DragState, { type: "create" }>) {
  const a = drag.anchorMinutes
  const b = drag.currentMinutes
  let start = Math.min(a, b)
  let end = Math.max(a, b)
  if (end - start < SNAP) end = start + SNAP
  start = clampMinutes(start)
  end = clampMinutes(end)
  if (end <= start) end = start + SNAP
  return { startMinutes: start, endMinutes: end }
}

export interface DragCreatePayload {
  dayIndex: number
  startMinutes: number
  endMinutes: number
}

export interface EventMovePayload {
  id: string
  dayIndex: number
  startMinutes: number
  endMinutes: number
}

export interface EventResizePayload {
  id: string
  endMinutes: number
}

export interface SidebarTaskDropPayload {
  taskId: string
  dayIndex: number
  startMinutes: number
  endMinutes: number
}

const DEFAULT_DROP_DURATION_MINUTES = 30

export function CalendarGrid({
  onDragCreate,
  onEventMove,
  onEventResize,
  onEventDoubleClick,
  onToggleComplete,
  onSidebarTaskDrop,
  externalEvents,
  anchorDate,
  draggingSidebarTask,
}: {
  onDragCreate?: (payload: DragCreatePayload) => void
  onEventMove?: (payload: EventMovePayload) => void
  onEventResize?: (payload: EventResizePayload) => void
  onEventDoubleClick?: (eventId: string) => void
  /** Marks task completed; same handler as sidebar — task then drops off the grid via parent state. */
  onToggleComplete?: (taskId: string) => void
  onSidebarTaskDrop?: (payload: SidebarTaskDropPayload) => void
  externalEvents?: CalendarEvent[]
  anchorDate?: Date
  draggingSidebarTask?: CalendarEvent | null
}) {
  const [currentMinutes, setCurrentMinutes] = useState<number | null>(null)
  const [todayDate, setTodayDate] = useState(() => new Date())
  const displayAnchor = anchorDate ?? todayDate
  const events = externalEvents ?? []
  const [drag, setDrag] = useState<DragState | null>(null)
  const [pendingEventMove, setPendingEventMove] = useState<{
    ev: CalendarEvent
    startX: number
    startY: number
    startTime: number
    offsetMinutes: number
  } | null>(null)
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null)
  const [sidebarDropTarget, setSidebarDropTarget] = useState<{
    dayIndex: number
    startMinutes: number
    endMinutes: number
  } | null>(null)
  const [sidebarDragPointer, setSidebarDragPointer] = useState<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [popover, setPopover] = useState<PopoverState>(null)
  const popoverHideTimer = useRef<number | null>(null)
  const isDragging = useRef(false)
  const columnRefs = useRef<(HTMLDivElement | null)[]>([])
  const gridRef = useRef<HTMLDivElement>(null)

  const MOVE_THRESHOLD_PX = 5
  const MOVE_THRESHOLD_MS = 200

  // ---------- Shared card visuals (committed / preview / draft) ----------
  const defaultColor = "var(--color-app-accent, #888)"
  const neutralCardColor = "var(--color-surface-2)"

  function cardBg(color: string, pct: number) {
    return `color-mix(in srgb, ${color} ${pct}%, transparent)`
  }

  function getEventCardStyles(color: string) {
    return {
      backgroundColor: cardBg(color, 25),
    } as React.CSSProperties
  }

  function getStripeStyles(color: string) {
    return {
      backgroundColor: cardBg(color, 50),
    } as React.CSSProperties
  }

  function getDragPreviewBg(color: string) {
    return { backgroundColor: `color-mix(in srgb, ${color} 90%, transparent)` } as React.CSSProperties
  }

const dropTargetHighlightClass = "pointer-events-none absolute inset-x-1 rounded-xs bg-border/30"
  // ---------------------------------------------------------------------

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(displayAnchor, { weekStartsOn: 0 })
    return DAY_LABELS.map((label, i) => {
      const day = addDays(weekStart, i)
      return { label, date: getDate(day), isToday: isToday(day) }
    })
  }, [displayAnchor])

  useEffect(() => {
    function update() {
      const now = new Date()
      setCurrentMinutes(now.getHours() * 60 + now.getMinutes())
      if (now.getDate() !== todayDate.getDate() || now.getMonth() !== todayDate.getMonth()) {
        setTodayDate(new Date())
      }
    }
    update()
    const interval = setInterval(update, 30000)
    return () => clearInterval(interval)
  }, [todayDate])

  const weekDates = useMemo(() => {
    const weekStart = startOfWeek(displayAnchor, { weekStartsOn: 0 })
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [displayAnchor])

  const hidePopoverSoon = useCallback(() => {
    if (popoverHideTimer.current) window.clearTimeout(popoverHideTimer.current)
    setPopover((prev) => (prev ? { ...prev, visible: false } : prev))
    popoverHideTimer.current = window.setTimeout(() => {
      setPopover(null)
    }, POPOVER_HIDE_MS)
  }, [])

  const showPopoverNow = useCallback((eventId: string, pos: { top: number; left: number }) => {
    if (popoverHideTimer.current) window.clearTimeout(popoverHideTimer.current)
    setPopover({ eventId, pos, visible: true })
  }, [])

  const handleEventPointerMove = useCallback(
    (e: React.PointerEvent, ev: CalendarEvent) => {
      if (isDragging.current) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const yRel = e.clientY - rect.top
      const zone: "top" | "bottom" = yRel < rect.height * ZONE_THRESHOLD ? "top" : "bottom"
      setHover((prev) => {
        if (prev?.eventId === ev.id && prev.zone === zone) return prev
        return { eventId: ev.id, zone }
      })
      if (zone === "top") {
        showPopoverNow(ev.id, { top: rect.top, left: rect.left - 8 })
      } else {
        hidePopoverSoon()
      }
    },
    [hidePopoverSoon, showPopoverNow]
  )

  const handleEventPointerLeave = useCallback(() => {
    if (isDragging.current) return
    setHover(null)
    hidePopoverSoon()
  }, [hidePopoverSoon])

  useEffect(() => {
    if (!drag) return
    setHover(null)
    if (popoverHideTimer.current) window.clearTimeout(popoverHideTimer.current)
    setPopover(null)
  }, [drag])

  useEffect(() => {
    if (!draggingSidebarTask) {
      setSidebarDropTarget(null)
      setSidebarDragPointer(null)
    }
  }, [draggingSidebarTask])

  useEffect(() => {
    return () => {
      if (popoverHideTimer.current) window.clearTimeout(popoverHideTimer.current)
    }
  }, [])

  const getMinutesFromY = useCallback((clientY: number, dayIndex: number) => {
    const col = columnRefs.current[dayIndex]
    if (!col) return MIN_MINUTES
    const relativeY = clientY - col.getBoundingClientRect().top
    const absoluteMinutes = MIN_MINUTES + (relativeY / HOUR_HEIGHT) * 60
    return clampMinutes(snapTo15(absoluteMinutes))
  }, [])

  const getDayIndexFromX = useCallback((clientX: number): number => {
    for (let i = 0; i < 7; i++) {
      const col = columnRefs.current[i]
      if (!col) continue
      const rect = col.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) return i
    }
    const first = columnRefs.current[0]?.getBoundingClientRect()
    const last = columnRefs.current[6]?.getBoundingClientRect()
    if (first && clientX < first.left) return 0
    if (last && clientX > last.right) return 6
    return 0
  }, [])

  const handleSidebarDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const taskId = e.dataTransfer.getData("text/plain")
      if (!taskId || !onSidebarTaskDrop) return
      const dayIndex = getDayIndexFromX(e.clientX)
      const startMinutes = getMinutesFromY(e.clientY, dayIndex)
      const endMinutes = Math.min(startMinutes + DEFAULT_DROP_DURATION_MINUTES, MAX_MINUTES)
      onSidebarTaskDrop({ taskId, dayIndex, startMinutes, endMinutes })
      setSidebarDropTarget(null)
      setSidebarDragPointer(null)
    },
    [getDayIndexFromX, getMinutesFromY, onSidebarTaskDrop]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      const dayIndex = getDayIndexFromX(e.clientX)
      const startMinutes = getMinutesFromY(e.clientY, dayIndex)
      const endMinutes = Math.min(startMinutes + DEFAULT_DROP_DURATION_MINUTES, MAX_MINUTES)
      setSidebarDropTarget({ dayIndex, startMinutes, endMinutes })
      setSidebarDragPointer({ x: e.clientX, y: e.clientY })
    },
    [getDayIndexFromX, getMinutesFromY]
  )

  const handleSidebarDragLeave = useCallback(() => {
    setSidebarDropTarget(null)
    setSidebarDragPointer(null)
  }, [])

  const handleGridPointerDown = useCallback(
    (e: React.PointerEvent, dayIndex: number) => {
      if (e.button !== 0) return
      e.preventDefault()
      const minutes = getMinutesFromY(e.clientY, dayIndex)
      isDragging.current = true
      setPointerPos({ x: e.clientX, y: e.clientY })
      setDrag({ type: "create", dayIndex, anchorMinutes: minutes, currentMinutes: minutes + SNAP })
    },
    [getMinutesFromY]
  )

  const handleEventPointerDown = useCallback(
    (e: React.PointerEvent, ev: CalendarEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      if (ev.startMinutes == null || ev.endMinutes == null) return
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      const minutesAtPointer = getMinutesFromY(e.clientY, ev.dayIndex)
      const offsetMinutes = minutesAtPointer - ev.startMinutes
      setPendingEventMove({
        ev,
        startX: e.clientX,
        startY: e.clientY,
        startTime: Date.now(),
        offsetMinutes,
      })
    },
    [getMinutesFromY]
  )

  const handleResizePointerDown = useCallback((e: React.PointerEvent, ev: CalendarEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    if (ev.startMinutes == null || ev.endMinutes == null) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    isDragging.current = true
    setDrag({
      type: "resize",
      eventId: ev.id,
      dayIndex: ev.dayIndex,
      startMinutes: ev.startMinutes,
      endMinutes: ev.endMinutes,
    })
  }, [])

  useEffect(() => {
    const hasActivePointer = drag || pendingEventMove
    if (!hasActivePointer) return
    let rafId: number | null = null

    function onMove(e: PointerEvent) {
      if (pendingEventMove) {
        const dx = e.clientX - pendingEventMove.startX
        const dy = e.clientY - pendingEventMove.startY
        const dt = Date.now() - pendingEventMove.startTime
        if (dx * dx + dy * dy >= MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX || dt >= MOVE_THRESHOLD_MS) {
          const { ev, offsetMinutes } = pendingEventMove
          if (ev.startMinutes != null && ev.endMinutes != null) {
            isDragging.current = true
            setPointerPos({ x: e.clientX, y: e.clientY })
            setDrag({
              type: "move",
              eventId: ev.id,
              dayIndex: ev.dayIndex,
              startMinutes: ev.startMinutes,
              endMinutes: ev.endMinutes,
              offsetMinutes,
            })
          }
          setPendingEventMove(null)
        }
        return
      }
      if (!isDragging.current || !drag) return
      e.preventDefault()
      if (drag.type === "move" || drag.type === "create") {
        setPointerPos({ x: e.clientX, y: e.clientY })
      }
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (drag.type === "create") {
          const minutes = getMinutesFromY(e.clientY, drag.dayIndex)
          setDrag((prev) => (prev && prev.type === "create" ? { ...prev, currentMinutes: minutes } : prev))
        } else if (drag.type === "move") {
          const newDay = getDayIndexFromX(e.clientX)
          const minutesAtPointer = getMinutesFromY(e.clientY, newDay)
          const duration = drag.endMinutes - drag.startMinutes
          let newStart = snapTo15(minutesAtPointer - drag.offsetMinutes)
          newStart = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES - duration, newStart))
          const newEnd = newStart + duration
          setDrag((prev) =>
            prev && prev.type === "move" ? { ...prev, dayIndex: newDay, startMinutes: newStart, endMinutes: newEnd } : prev
          )
        } else if (drag.type === "resize") {
          const minutesAtPointer = getMinutesFromY(e.clientY, drag.dayIndex)
          const newEnd = Math.max(drag.startMinutes + SNAP, clampMinutes(minutesAtPointer))
          setDrag((prev) => (prev && prev.type === "resize" ? { ...prev, endMinutes: newEnd } : prev))
        }
      })
    }

    function onUp(e: PointerEvent) {
      if (pendingEventMove) {
        setPendingEventMove(null)
        try {
          ;(e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId)
        } catch {
          // ignore
        }
        return
      }
      if (!isDragging.current || !drag) return
      isDragging.current = false
      setPointerPos(null)
      if (drag.type === "create") {
        const { startMinutes, endMinutes } = getCreateRange(drag)
        onDragCreate?.({ dayIndex: drag.dayIndex, startMinutes, endMinutes })
      } else if (drag.type === "move") {
        onEventMove?.({
          id: drag.eventId,
          dayIndex: drag.dayIndex,
          startMinutes: drag.startMinutes,
          endMinutes: drag.endMinutes,
        })
      } else if (drag.type === "resize") {
        onEventResize?.({
          id: drag.eventId,
          endMinutes: drag.endMinutes,
        })
      }
      setDrag(null)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [drag, pendingEventMove, getMinutesFromY, getDayIndexFromX])

  const showTimeLine =
    currentMinutes !== null &&
    (currentMinutes / 60 - START_HOUR) * HOUR_HEIGHT > 0 &&
    (currentMinutes / 60 - START_HOUR) * HOUR_HEIGHT < HOURS.length * HOUR_HEIGHT

  const currentTimeOffset = currentMinutes !== null ? (currentMinutes / 60 - START_HOUR) * HOUR_HEIGHT : 0
  const currentHour = currentMinutes !== null ? Math.floor(currentMinutes / 60) : 0
  const currentMin = currentMinutes !== null ? currentMinutes % 60 : 0
  const timeLabel = `${currentHour.toString().padStart(2, "0")}:${currentMin.toString().padStart(2, "0")}`

  const draggingEventId = drag?.type === "move" || drag?.type === "resize" ? drag.eventId : null
  const resizingEventId = drag?.type === "resize" ? drag.eventId : null

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-tl-xl border border-border/10">
      {/* Day headers */}
      <div className="flex shrink-0">
        <div className="w-14 shrink-0" />
        <div className="flex flex-1 border-b border-border/20">
          {weekDays.map((day) => (
            <div
              key={day.label}
              className={cn("flex flex-1 flex-row items-center justify-center py-4", day.isToday ? "gap-1" : "gap-0")}
            >
              <span className={cn("text-[11px] font-medium tracking-normal", day.isToday ? "text-text-muted" : "text-text-faint")}>
                {day.label}
              </span>
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded text-[13px] font-medium leading-none",
                  day.isToday ? "bg-app-accent text-app-accent-foreground" : "text-text"
                )}
              >
                {day.date}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable time grid — accepts sidebar task drops */}
      <div
        className="relative flex-1 overflow-y-auto"
        data-scroll-area
        onDragOver={handleDragOver}
        onDrop={handleSidebarDrop}
        onDragLeave={handleSidebarDragLeave}
      >
        <div ref={gridRef} className="relative flex" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
          {/* Time gutter */}
          <div className="relative w-14 shrink-0">
            {HOURS.map((hour, i) => (
              <div key={hour} className="absolute right-0 flex w-full items-start justify-end pr-3" style={{ top: i * HOUR_HEIGHT }}>
                <span className="text-[10px] leading-none text-text-faint tabular-nums">{formatHour(hour)}</span>
              </div>
            ))}
          </div>

          {/* Grid area */}
          <div className="relative flex flex-1">
            {/* Horizontal hour lines */}
            {HOURS.map((hour, i) => {
              if (i === 0) return null
              return (
                <div
                  key={`line-${hour}`}
                  className="pointer-events-none absolute left-0 right-0 border-t border-border/20"
                  style={{ top: i * HOUR_HEIGHT }}
                />
              )
            })}

            {/* Day columns */}
            {weekDays.map((day, dayIndex) => (
              <div
                key={day.label}
                ref={(el) => {
                  columnRefs.current[dayIndex] = el
                }}
                className="relative flex-1 border-l border-border/20 select-none"
                onPointerDown={(e) => handleGridPointerDown(e, dayIndex)}
              >
                {HOURS.map((hour) => (
                  <div key={hour} style={{ height: HOUR_HEIGHT }} />
                ))}

                {/* Drop target highlight (committed-task drag or sidebar drag) — same style for both */}
                {(drag && (drag.type === "move" || drag.type === "create") && drag.dayIndex === dayIndex && (() => {
                  const { top, height } = getEventPosition(
                    drag.type === "create" ? getCreateRange(drag).startMinutes : drag.startMinutes,
                    drag.type === "create" ? getCreateRange(drag).endMinutes : drag.endMinutes
                  )
                  return <div className={dropTargetHighlightClass} style={{ top, height }} />
                })())}
                {sidebarDropTarget && sidebarDropTarget.dayIndex === dayIndex && (() => {
                  const { top, height } = getEventPosition(sidebarDropTarget.startMinutes, sidebarDropTarget.endMinutes)
                  return (
                    <div className={dropTargetHighlightClass} style={{ top, height }} />
                  )
                })()}

                {/* Committed events — only show tasks with a duration (scheduled time block) */}
                {events
                  .filter((ev) => ev.dayIndex === dayIndex && ev.startMinutes != null && ev.endMinutes != null)
                  .map((ev) => {
                    if (draggingEventId === ev.id) return null
                    const isResizing = resizingEventId === ev.id
                    const isHovered = hover?.eventId === ev.id
                    const inBottomZone = isHovered && hover.zone === "bottom"
                    const showHandle = isResizing || inBottomZone
                    const { top, height } = getEventPosition(ev.startMinutes!, ev.endMinutes!)
                    const evColor = ev.tagColor || defaultColor

                    return (
                      <div
                        key={ev.id}
                        className="group absolute inset-x-1 cursor-grab overflow-hidden rounded-md pl-[11px] pr-3 py-2 active:cursor-grabbing"
                        style={{ top, height, ...getEventCardStyles(evColor) }}
                        onPointerDown={(e) => handleEventPointerDown(e, ev)}
                        onPointerMove={(e) => handleEventPointerMove(e, ev)}
                        onPointerLeave={handleEventPointerLeave}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          console.log("[calendar-grid] card onDoubleClick fired", { eventId: ev.id, title: ev.title })
                          onEventDoubleClick?.(ev.id)
                        }}
                      >
                        {/* Left color stripe */}
                        <div className="absolute left-0 top-0 h-full w-[3px]" style={getStripeStyles(evColor)} />

                        <div className="flex min-h-0 min-w-0 gap-1.5">
                          <button
                            type="button"
                            aria-label={`Mark "${ev.title}" complete`}
                            className={cn(
                              "group/cal-task-check pointer-events-auto relative z-[1] mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-text-faint/45 bg-transparent outline-none",
                              "hover:border-text-muted/70 focus-visible:ring-1 focus-visible:ring-app-accent focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                            )}
                            onPointerDown={(e) => {
                              e.stopPropagation()
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleComplete?.(ev.id)
                            }}
                            onDoubleClick={(e) => e.stopPropagation()}
                          >
                            <Check
                              aria-hidden
                              className="pointer-events-none h-3 w-3 text-text-muted/75 opacity-0 transition-opacity duration-150 ease-out group-hover/cal-task-check:opacity-100"
                              strokeWidth={2.25}
                            />
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium leading-tight text-text">{ev.title}</p>
                            <p className="mt-0.5 truncate text-[10px] leading-tight text-text-faint/60">
                              {formatTime12(ev.startMinutes!)} - {formatTime12(ev.endMinutes!)}
                            </p>
                          </div>
                        </div>

                        <div
                          className={cn(
                            "absolute inset-x-0 bottom-0 flex h-4 cursor-ns-resize items-end justify-center pb-1",
                            "transition-opacity duration-200 ease-out",
                            showHandle ? "opacity-100" : "opacity-0"
                          )}
                          onPointerDown={(e) => handleResizePointerDown(e, ev)}
                        >
                          <div
                            className={cn(
                              "h-1 w-8 rounded-full origin-center",
                              "transition-transform transition-colors duration-1000 ease-[cubic-bezier(0.4,0,0.2,1)]",
                              isResizing ? "scale-x-100 scale-y-100 bg-white/15" : "scale-x-75 scale-y-[0.75] bg-white/10"
                            )}
                          />
                        </div>
                      </div>
                    )
                  })}

                {/* Resize preview (in-place; move uses floating preview) */}
                {drag?.type === "resize" && drag.dayIndex === dayIndex && (() => {
                  const { top, height } = getEventPosition(drag.startMinutes, drag.endMinutes)
                  const sourceEvent = events.find((ev) => ev.id === drag.eventId)
                  const previewColor = sourceEvent?.tagColor || defaultColor
                  return (
                    <div
                      className="pointer-events-none absolute inset-x-1 overflow-hidden rounded-md pl-[11px] pr-3 py-2"
                      style={{ top, height, ...getEventCardStyles(previewColor) }}
                    >
                      <div className="absolute left-0 top-0 h-full w-[3px]" style={getStripeStyles(previewColor)} />
                      <p className="truncate text-xs font-medium text-text-faint/60">{sourceEvent?.title ?? "Event"}</p>
                      <p className="truncate text-[10px] text-text-faint/50">
                        {formatTime12(drag.startMinutes)} - {formatTime12(drag.endMinutes)}
                      </p>
                      <div className="absolute inset-x-0 bottom-0 flex h-4 items-end justify-center pb-1">
                        <div className="h-1 w-8 rounded-full bg-white/20" />
                      </div>
                    </div>
                  )
                })()}

                {/* Create-drag preview (inline only; neutral grey like untagged cards) */}
                {drag?.type === "create" && drag.dayIndex === dayIndex && (() => {
                  const { startMinutes, endMinutes } = getCreateRange(drag)
                  const { top, height } = getEventPosition(startMinutes, endMinutes)
                  return (
                    <div
                      className="pointer-events-none absolute inset-x-1 overflow-hidden rounded-md pl-[11px] pr-3 py-2"
                      style={{ top, height, ...getEventCardStyles(neutralCardColor) }}
                    >
                      <div className="absolute left-0 top-0 h-full w-[3px]" style={getStripeStyles(neutralCardColor)} />
                      <p className="truncate text-xs font-medium text-text-faint/60">New Task</p>
                      <p className="truncate text-[10px] text-text-faint/50">
                        {formatTime12(startMinutes)} - {formatTime12(endMinutes)}
                      </p>
                      {height > 48 && (
                        <div className="absolute inset-x-0 bottom-2 flex justify-center">
                          <div className="h-[1px] w-4 rounded-full bg-white/10" />
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}

            {/* Event info popover */}
            {popover && !drag && (() => {
              const ev = events.find((e) => e.id === popover.eventId)
              if (!ev || ev.startMinutes == null || ev.endMinutes == null) return null
              const dayDate = weekDates[ev.dayIndex]
              const duration = ev.endMinutes - ev.startMinutes

              return createPortal(
                <div
                  className={cn(
                    "pointer-events-none fixed z-50 w-[280px] rounded-xl border border-border/40 bg-surface/95 p-4 shadow-xl backdrop-blur-sm",
                    "transition-opacity duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
                    popover.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
                  )}
                  style={{
                    top: popover.pos.top,
                    left: popover.pos.left,
                    transform: `translateX(-100%) ${popover.visible ? "translateY(0px)" : "translateY(4px)"}`,
                  }}
                >
                  <div className="mb-4 flex gap-2.5">
                    <div className="mt-0.5 h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: ev.tagColor || "var(--color-app-accent)" }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text">{ev.title}</p>
                      <p className="mt-0.5 truncate text-xs text-text-faint">
                        {ev.notes?.trim() ? ev.notes.trim() : "No notes yet"}
                      </p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-text-faint" />
                      <span className="text-[11px] font-medium text-text-muted">Date</span>
                    </div>
                    <div className="flex items-center gap-2 pl-0.5">
                      <span className="rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-text tabular-nums">
                        {dayDate ? format(dayDate, "dd/MM/yy") : ""}
                      </span>
                      <span className="text-xs text-text-faint">{dayDate ? format(dayDate, "EEE, d") : ""}</span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-text-faint" />
                      <span className="text-[11px] font-medium text-text-muted">Time</span>
                    </div>
                    <div className="flex items-center gap-2 pl-0.5">
                      <span className="rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-text tabular-nums">
                        {formatTime12Short(ev.startMinutes)} - {formatTime12Short(ev.endMinutes)}
                      </span>
                      <span className="text-xs text-text-faint">{formatDuration(duration)}</span>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-text-faint" />
                      <span className="text-[11px] font-medium text-text-muted">Assignee</span>
                    </div>
                    <div className="pl-0.5">
                      <span className="rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-text">
                        {formatAssigneeLabel(ev.assignee)}
                      </span>
                    </div>
                  </div>
                </div>,
                document.body
              )
            })()}

            {/* Floating drag preview (move or sidebar task only; create uses inline preview) */}
            {(() => {
              const PREVIEW_OFFSET = 1
              let node: React.ReactNode = null
              if (drag?.type === "move" && pointerPos) {
                const sourceEvent = events.find((e) => e.id === drag.eventId)
                const color = sourceEvent?.tagColor ?? defaultColor
                node = (
                  <div
                    className="pointer-events-none fixed z-[100] max-w-[200px] rounded-lg px-3 py-2 shadow-lg"
                    style={{
                      left: pointerPos.x + PREVIEW_OFFSET,
                      top: pointerPos.y + PREVIEW_OFFSET,
                      ...getDragPreviewBg(color),
                    }}
                  >
                    <p className="truncate text-sm font-medium text-white">{sourceEvent?.title ?? "Event"}</p>
                    <p className="mt-1 truncate text-xs text-white/80">
                      {formatTime12(drag.startMinutes)} – {formatTime12(drag.endMinutes)}
                    </p>
                  </div>
                )
              } else if (draggingSidebarTask && (sidebarDragPointer || sidebarDropTarget)) {
                const pos = sidebarDragPointer ?? { x: 0, y: 0 }
                const color = draggingSidebarTask.tagColor ?? defaultColor
                const timeStr = sidebarDropTarget
                  ? `${formatTime12(sidebarDropTarget.startMinutes)} – ${formatTime12(sidebarDropTarget.endMinutes)}`
                  : "—"
                node = (
                  <div
                    className="pointer-events-none fixed z-[100] max-w-[200px] rounded-lg px-3 py-2 shadow-lg"
                    style={{
                      left: pos.x + PREVIEW_OFFSET,
                      top: pos.y + PREVIEW_OFFSET,
                      ...getDragPreviewBg(color),
                    }}
                  >
                    <p className="truncate text-sm font-medium text-white">{draggingSidebarTask.title}</p>
                    <p className="mt-1 truncate text-xs text-white/80">{timeStr}</p>
                  </div>
                )
              }
              return node ? createPortal(node, document.body) : null
            })()}

            {/* Current time indicator */}
            {showTimeLine && (
              <div className="pointer-events-none absolute left-0 right-0 z-10" style={{ top: `${currentTimeOffset}px` }}>
                <div className="absolute -top-2.5 flex items-center justify-end pr-1.5" style={{ left: -56, width: 56 }}>
                  <span className="rounded-sm bg-app-accent px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-app-accent-foreground tabular-nums">
                    {timeLabel}
                  </span>
                </div>
                <div className="h-px bg-app-accent/80" />
                <div className="absolute -top-[3px] left-0 h-[7px] w-[7px] rounded-full bg-app-accent" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
