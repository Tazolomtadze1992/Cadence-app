"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { motion } from "framer-motion"
import { Plus, ChevronLeft, ChevronRight, ArrowRight, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { TaskEditorPanel } from "@/components/chrono/task-editor-modal"
import type { TaskEditorInitialData, TaskEditorSaveData, EditingTaskData } from "@/components/chrono/task-editor-modal"
import {
  format,
  parse,
  addDays,
  addWeeks,
  addMonths,
  startOfDay,
  isValid,
} from "date-fns"

const COLLAPSED_HEIGHT = 52
const TRANSITION = { duration: 0.24, ease: [0.25, 0.1, 0.25, 1] as const }

// ─── Date Parsing ────────────────────────────────────────────────────────────
function parseNaturalDate(input: string): Date | null {
  const text = input.trim().toLowerCase()
  if (!text) return null

  const now = new Date()
  const today = startOfDay(now)

  // Relative keywords
  if (text === "today") return today
  if (text === "tomorrow") return addDays(today, 1)
  if (text === "yesterday") return addDays(today, -1)
  if (text === "next week") return addWeeks(today, 1)
  if (text === "next month") return addMonths(today, 1)

  // "in X days/weeks/months" or just "X days/weeks/months"
  const relativeMatch = text.match(/^(?:in\s+)?(\d+)\s*(days?|weeks?|months?)$/i)
  if (relativeMatch) {
    const num = parseInt(relativeMatch[1], 10)
    const unit = relativeMatch[2].toLowerCase()
    if (unit.startsWith("day")) return addDays(today, num)
    if (unit.startsWith("week")) return addWeeks(today, num)
    if (unit.startsWith("month")) return addMonths(today, num)
  }

  // Try parsing absolute dates with various formats
  const currentYear = now.getFullYear()

  // Formats to try (date-fns parse)
  const formats = [
    "yyyy-MM-dd",        // 2026-03-01
    "MM/dd/yyyy",        // 03/01/2026
    "MM/dd",             // 03/01 (assume current year)
    "MMMM d yyyy",       // March 1 2026
    "MMMM d, yyyy",      // March 1, 2026
    "MMMM d",            // March 1 (assume current year)
    "MMM d yyyy",        // Mar 1 2026
    "MMM d, yyyy",       // Mar 1, 2026
    "MMM d",             // Mar 1 (assume current year)
    "d MMMM yyyy",       // 1 March 2026
    "d MMMM",            // 1 March (assume current year)
    "d MMM yyyy",        // 1 Mar 2026
    "d MMM",             // 1 Mar (assume current year)
  ]

  for (const fmt of formats) {
    const parsed = parse(text, fmt, now)
    if (isValid(parsed)) {
      // If year wasn't in the format, it defaults to 1900 or current reference year
      // Check if the parsed year is way off and fix it
      if (parsed.getFullYear() < 2000) {
        parsed.setFullYear(currentYear)
      }
      return startOfDay(parsed)
    }
  }

  return null
}

export function CommandBar({
  externalOpen,
  onExternalOpenHandled,
  onTaskSave,
  editingTask,
  onEditSave,
  onEditDone,
  onGoToDate,
  onGoToToday,
  onPrevWeek,
  onNextWeek,
}: {
  externalOpen?: TaskEditorInitialData | null
  onExternalOpenHandled?: () => void
  onTaskSave?: (data: TaskEditorSaveData) => void
  editingTask?: EditingTaskData | null
  onEditSave?: (id: string, data: TaskEditorSaveData) => void
  onEditDone?: () => void
  onGoToDate?: (date: Date) => void
  onGoToToday?: () => void
  onPrevWeek?: () => void
  onNextWeek?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [initialData, setInitialData] = useState<TaskEditorInitialData | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const [expandedHeight, setExpandedHeight] = useState(440)

  // "Go to date" search mode
  const [dateSearchMode, setDateSearchMode] = useState(false)
  const [dateQuery, setDateQuery] = useState("")
  const dateInputRef = useRef<HTMLInputElement>(null)

  const parsedDate = useMemo(() => parseNaturalDate(dateQuery), [dateQuery])

  // Focus input when entering date search mode
  useEffect(() => {
    if (dateSearchMode) {
      setTimeout(() => dateInputRef.current?.focus(), 50)
    }
  }, [dateSearchMode])

  const exitDateSearchMode = useCallback(() => {
    setDateSearchMode(false)
    setDateQuery("")
  }, [])

  const confirmGoToDate = useCallback(() => {
    if (parsedDate) {
      onGoToDate?.(parsedDate)
      exitDateSearchMode()
    }
  }, [parsedDate, onGoToDate, exitDateSearchMode])

  // Handle external open requests (e.g. from drag-create)
  useEffect(() => {
    if (externalOpen) {
      setInitialData(externalOpen)
      setEditorKey((k) => k + 1)
      setExpanded(true)
      onExternalOpenHandled?.()
    }
  }, [externalOpen, onExternalOpenHandled])

  // Handle edit mode open (double-click on event)
  useEffect(() => {
    if (editingTask) {
      console.log("[CommandBar] editingTask set, expanding panel", { id: editingTask.id, title: editingTask.title })
      setEditorKey((k) => k + 1)
      setExpanded(true)
    }
  }, [editingTask])

  const handleClose = useCallback(() => {
    setExpanded(false)
    setInitialData(null)
    onEditDone?.()
  }, [onEditDone])

  // ESC to collapse or exit date search; clear edit state when closing so next open is create mode
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (dateSearchMode) {
          exitDateSearchMode()
        } else if (expanded) {
          setExpanded(false)
          setInitialData(null)
          onEditDone?.()
        }
      }
      // Enter to confirm date search
      if (e.key === "Enter" && dateSearchMode && parsedDate) {
        e.preventDefault()
        confirmGoToDate()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [expanded, dateSearchMode, parsedDate, exitDateSearchMode, confirmGoToDate])

  // Measure expanded content height after it renders
  useEffect(() => {
    if (expanded && contentRef.current) {
      const measure = () => {
        if (contentRef.current) {
          const h = contentRef.current.scrollHeight
          if (h > 0) setExpandedHeight(h)
        }
      }
      // Measure after a frame to ensure content is rendered
      requestAnimationFrame(measure)
    }
  }, [expanded])

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex items-end justify-center px-4">
      {/* Single motion container that animates height */}
      <motion.div
        className="pointer-events-auto w-full max-w-[380px] overflow-hidden rounded-xl border border-border/50 bg-secondary shadow-sm"
        style={{ originY: 1 }}
        initial={false}
        animate={{
          height: expanded
            ? expandedHeight
            : dateSearchMode && dateQuery.trim()
              ? COLLAPSED_HEIGHT + 56 // Add space for suggestion row
              : COLLAPSED_HEIGHT,
        }}
        transition={TRANSITION}
      >
        {/* Expanded content */}
        <div
          ref={contentRef}
          className={cn(
            "transition-opacity duration-200 ease-out",
            expanded
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none absolute inset-x-0 top-0 opacity-0"
          )}
        >
          {expanded && (
            <TaskEditorPanel
              key={editorKey}
              onClose={handleClose}
              onSave={onTaskSave}
              onEditSave={onEditSave}
              initialData={initialData}
              editingTask={editingTask}
            />
          )}
        </div>

        {/* Collapsed content - Default mode */}
        {!dateSearchMode && (
          <div
            className={cn(
              "flex items-center justify-center gap-1 px-4 transition-opacity duration-200 ease-out",
              expanded
                ? "pointer-events-none opacity-0"
                : "pointer-events-auto opacity-100"
            )}
            style={{ height: COLLAPSED_HEIGHT }}
          >
            <button
              onClick={() => { setInitialData(null); setEditorKey((k) => k + 1); setExpanded(true) }}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
            >
              <Plus className="h-3.5 w-3.5" />
              Add new
            </button>

            <div className="mx-1 h-4 w-px bg-border" />

            <div className="flex items-center gap-0.5">
              <button
                onClick={onPrevWeek}
                className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:text-text"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onGoToToday}
                className="flex items-center rounded px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
              >
                Today
              </button>
              <button
                onClick={onNextWeek}
                className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:text-text"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mx-1 h-4 w-px bg-border" />

            <button
              onClick={() => setDateSearchMode(true)}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Go to date
            </button>
          </div>
        )}

        {/* Collapsed content - Date search mode */}
        {dateSearchMode && !expanded && (
          <div
            className="flex flex-col"
            style={{ minHeight: COLLAPSED_HEIGHT }}
          >
            {/* Input row */}
            <div className="flex items-center gap-3 px-4" style={{ height: COLLAPSED_HEIGHT }}>
              <button
                onClick={exitDateSearchMode}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:text-text"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <input
                ref={dateInputRef}
                type="text"
                value={dateQuery}
                onChange={(e) => setDateQuery(e.target.value)}
                placeholder="e.g. nov 5, in 10 weeks"
                className="flex-1 bg-transparent text-sm font-medium text-text placeholder:text-text-faint focus:outline-none"
              />
            </div>

            {/* Suggestion row */}
            {dateQuery.trim() && (
              <div className="border-t border-border/30 px-4 py-2 pb-4">
                {parsedDate ? (
                  <button
                    onClick={confirmGoToDate}
                    className="group w-full rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium text-text-muted transition-all duration-200 ease-out hover:bg-background/50 hover:text-text active:scale-[0.995]"
                  >
                    <span className="transition-colors duration-150 group-hover:text-text">
                      Go to {format(parsedDate, "MMMM d, yyyy")}
                    </span>
                  </button>
                ) : (
                  <p className="px-3 py-2 text-sm text-text-faint">No matching date found</p>
                )}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}

