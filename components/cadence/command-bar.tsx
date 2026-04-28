"use client"

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
  type CSSProperties,
  type TransitionEvent,
  type ChangeEvent,
} from "react"
import { createPortal } from "react-dom"
import { motion, useReducedMotion } from "framer-motion"
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  Check,
  Trash2,
  Layers,
  Image as ImageIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { TaskEditorPanel, priorityOptions } from "@/components/cadence/task-editor-modal"
import type { TaskEditorInitialData, TaskEditorSaveData, EditingTaskData } from "@/components/cadence/task-editor-modal"
import type { CanvasProject } from "@/components/cadence/canvas-board"
import type { AppMode } from "@/components/cadence/top-bar"
import { ShortcutHintWrap } from "@/components/cadence/icon-tooltip-button"
import {
  CADENCE_EASE_OUT,
  CADENCE_EASE_OUT_CSS,
  DOCK_SCHEDULE_REVEAL_DELAY_MS,
  FLOATING_MENU_CLOSE_MS,
  FLOATING_MENU_EASE_CSS,
  FLOATING_MENU_OPEN_MS,
  SHELL_CLOSE_MS,
  SHELL_CLOSE_S,
  SHELL_OPEN_MS,
  SHELL_OPEN_S,
} from "@/lib/cadence-motion"
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

const SHELL_BEZIER_CSS = CADENCE_EASE_OUT_CSS

/** Subtle exit nudge for date-search face (GPU-friendly; pairs with shell canvas strip language). */
const DATE_SEARCH_EXIT_NUDGE_PX = 4

/**
 * Filled-input “Go to date” exit: one Dynamic-Island-style morph (shell + layered faces together).
 * Shell uses SHELL_CLOSE_S; faces choreographed in ms on the same curve.
 */
const FILLED_EXIT_MORPH_MS = SHELL_CLOSE_MS
/** Date face exits slightly faster than the shell morph. */
const FILLED_EXIT_DATE_FACE_MS = Math.round(SHELL_CLOSE_MS * 0.72)
/** Idle fades in mid-morph, not after the shell stops. */
const FILLED_EXIT_IDLE_DELAY_MS = Math.round(SHELL_CLOSE_MS * 0.52)
const FILLED_EXIT_IDLE_FADE_MS = Math.max(
  96,
  FILLED_EXIT_MORPH_MS - FILLED_EXIT_IDLE_DELAY_MS + 28
)
const FILLED_EXIT_MORPH_CLEANUP_MS =
  Math.max(
    FILLED_EXIT_MORPH_MS,
    FILLED_EXIT_IDLE_DELAY_MS + FILLED_EXIT_IDLE_FADE_MS
  ) + 32

type DateSearchExitPhase = "inactive" | "filled-exit-morph"

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

export type CommandBarBulkSelection = {
  count: number
  onExit: () => void
  onDone: () => void
  onDelete: () => void
  onProject: (projectId: string) => void
  onPriority: (priority: string) => void
}

/** Keeps bulk strip in the layout when idle so idle ↔ bulk crossfade shares geometry (width). */
const BULK_FACE_LAYOUT_STUB: CommandBarBulkSelection = {
  count: 0,
  onExit: () => {},
  onDone: () => {},
  onDelete: () => {},
  onProject: () => {},
  onPriority: () => {},
}

function BulkChooserPopover({
  anchorRect,
  children,
  onClose,
  reducedMotion,
}: {
  anchorRect: DOMRect
  children: ReactNode
  onClose: () => void
  reducedMotion: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(reducedMotion)
  const exitHandledRef = useRef(false)

  const width = 200
  /** Same 4px offset as task-editor `DropdownField`. */
  const gap = 4
  const edgePad = 8
  const left = Math.max(edgePad, Math.min(anchorRect.left, window.innerWidth - width - edgePad))

  /** Prefer opening upward (command bar sits at bottom); same geometry as `DropdownField` `openUp`. */
  const minSpaceAbove = 100
  const openUp = anchorRect.top >= minSpaceAbove
  const posTop = anchorRect.top - gap
  const posBelow = anchorRect.bottom + gap

  const requestClose = useCallback(() => {
    exitHandledRef.current = false
    if (reducedMotion) {
      onClose()
      return
    }
    setVisible(false)
  }, [onClose, reducedMotion])

  useEffect(() => {
    if (reducedMotion) setVisible(true)
    else requestAnimationFrame(() => setVisible(true))
  }, [reducedMotion])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) requestClose()
    }
    const t = window.setTimeout(() => document.addEventListener("mousedown", onDocMouseDown), 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener("mousedown", onDocMouseDown)
    }
  }, [requestClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [requestClose])

  function handleTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (reducedMotion) return
    if (e.propertyName !== "opacity" && e.propertyName !== "transform") return
    if (exitHandledRef.current || visible) return
    exitHandledRef.current = true
    onClose()
  }

  const positionStyle: CSSProperties = openUp
    ? { left, bottom: `calc(100vh - ${posTop}px)` }
    : { left, top: posBelow }

  const transformOrigin = openUp ? "bottom left" : "top left"
  const hiddenTransform = openUp ? "translateY(4px) scale(0.98)" : "translateY(-4px) scale(0.98)"

  return createPortal(
    <div
      ref={ref}
      className={cn(
        "fixed z-[100] max-h-[260px] w-[200px] overflow-y-auto rounded-xl border border-border/50 bg-background py-1 shadow-lg",
        reducedMotion && "transition-none"
      )}
      style={{
        ...positionStyle,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : hiddenTransform,
        transition: reducedMotion
          ? "none"
          : visible
            ? `opacity ${FLOATING_MENU_OPEN_MS}ms ${FLOATING_MENU_EASE_CSS}, transform ${FLOATING_MENU_OPEN_MS}ms ${FLOATING_MENU_EASE_CSS}`
            : `opacity ${FLOATING_MENU_CLOSE_MS}ms ${FLOATING_MENU_EASE_CSS}, transform ${FLOATING_MENU_CLOSE_MS}ms ${FLOATING_MENU_EASE_CSS}`,
        transformOrigin,
      }}
      onMouseDown={(e) => e.preventDefault()}
      onTransitionEnd={handleTransitionEnd}
    >
      {children}
    </div>,
    document.body
  )
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
  projects,
  bulkSelection,
  onEditorOpen,
  dock = "fixed",
  appMode = "schedule",
  onAddCanvasNote,
  onAddCanvasImageFile,
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
  projects: CanvasProject[]
  bulkSelection?: CommandBarBulkSelection | null
  /** Fired when the task editor shell opens from this bar (e.g. Add new). */
  onEditorOpen?: () => void
  /** `inline`: shell only (parent provides positioning / mode cross-fade). */
  dock?: "fixed" | "inline"
  appMode?: AppMode
  onAddCanvasNote?: () => void
  onAddCanvasImageFile?: (file: File) => void
}) {
  const [expanded, setExpanded] = useState(false)
  /** Keeps `TaskEditorPanel` mounted through close animation until shell height finishes. */
  const [mountEditor, setMountEditor] = useState(false)
  const [initialData, setInitialData] = useState<TaskEditorInitialData | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const idleStripMeasureRef = useRef<HTMLDivElement>(null)
  const bulkStripMeasureRef = useRef<HTMLDivElement>(null)
  const dateStripMeasureRef = useRef<HTMLDivElement>(null)
  const [idleStripW, setIdleStripW] = useState(0)
  const [bulkStripW, setBulkStripW] = useState(0)
  const [dateStripW, setDateStripW] = useState(0)
  const [expandedHeight, setExpandedHeight] = useState(440)
  const shouldReduceMotion = useReducedMotion()

  // "Go to date" search mode
  const [dateSearchMode, setDateSearchMode] = useState(false)
  const [dateQuery, setDateQuery] = useState("")
  /** Keeps suggestion row height until after exit opacity + shell timing (see exitDateSearchMode). */
  const [deferDateQueryClear, setDeferDateQueryClear] = useState(false)
  const [dateSearchExitPhase, setDateSearchExitPhase] = useState<DateSearchExitPhase>("inactive")
  const dateSearchExitSeqTimersRef = useRef<number[]>([])
  const dateInputRef = useRef<HTMLInputElement>(null)

  const parsedDate = useMemo(() => parseNaturalDate(dateQuery), [dateQuery])

  const clearDateSearchExitSequenceTimers = useCallback(() => {
    for (const id of dateSearchExitSeqTimersRef.current) {
      window.clearTimeout(id)
    }
    dateSearchExitSeqTimersRef.current = []
  }, [])

  useEffect(
    () => () => clearDateSearchExitSequenceTimers(),
    [clearDateSearchExitSequenceTimers]
  )

  // Focus input when entering date search mode; blur when leaving
  useEffect(() => {
    if (dateSearchMode) {
      setTimeout(() => dateInputRef.current?.focus(), 50)
    } else {
      dateInputRef.current?.blur()
    }
  }, [dateSearchMode])

  const enterDateSearchMode = useCallback(() => {
    clearDateSearchExitSequenceTimers()
    setDateSearchExitPhase("inactive")
    setDeferDateQueryClear(false)
    setDateSearchMode(true)
  }, [clearDateSearchExitSequenceTimers])

  const exitDateSearchMode = useCallback(
    (immediate = false) => {
      clearDateSearchExitSequenceTimers()
      setDeferDateQueryClear(false)

      if (immediate) {
        setDateSearchExitPhase("inactive")
        setDateSearchMode(false)
        setDateQuery("")
        return
      }

      if (dateQuery.trim()) {
        if (shouldReduceMotion) {
          setDateSearchExitPhase("inactive")
          setDateSearchMode(false)
          setDateQuery("")
        } else {
          setDeferDateQueryClear(true)
          setDateSearchMode(false)
          setDateSearchExitPhase("filled-exit-morph")
          const id = window.setTimeout(() => {
            setDateSearchExitPhase("inactive")
            setDateQuery("")
            setDeferDateQueryClear(false)
            dateSearchExitSeqTimersRef.current = []
          }, FILLED_EXIT_MORPH_CLEANUP_MS)
          dateSearchExitSeqTimersRef.current = [id]
        }
      } else {
        setDateSearchExitPhase("inactive")
        setDateSearchMode(false)
        setDateQuery("")
      }
    },
    [clearDateSearchExitSequenceTimers, dateQuery, shouldReduceMotion]
  )

  const [bulkPicker, setBulkPicker] = useState<null | { kind: "project" | "priority"; rect: DOMRect }>(
    null
  )
  const bulkWasActiveRef = useRef(false)
  const canvasStripMeasureRef = useRef<HTMLDivElement>(null)
  const canvasFileInputRef = useRef<HTMLInputElement>(null)
  const [canvasStripW, setCanvasStripW] = useState(0)
  /**
   * After first mount, shell/collapsed width morphs are allowed. Disabled until then so measurement
   * does not animate from the pre-measure fallback width (avoids “tiny + → full bar” on load).
   */
  const [shellWidthMorphEnabled, setShellWidthMorphEnabled] = useState(false)
  /** After canvas→schedule: delay idle/bulk opacity in so shell width can lead (ms). */
  const [scheduleRevealDelayMs, setScheduleRevealDelayMs] = useState(0)
  const wasCanvasRef = useRef(false)

  const isCanvas = appMode === "canvas"

  useLayoutEffect(() => {
    const prev = wasCanvasRef.current
    wasCanvasRef.current = isCanvas
    if (shouldReduceMotion) {
      setScheduleRevealDelayMs(0)
      return
    }
    if (isCanvas) {
      setScheduleRevealDelayMs(0)
      return
    }
    if (prev && !isCanvas) {
      setScheduleRevealDelayMs(DOCK_SCHEDULE_REVEAL_DELAY_MS)
      const id = window.setTimeout(
        () => setScheduleRevealDelayMs(0),
        DOCK_SCHEDULE_REVEAL_DELAY_MS + SHELL_OPEN_MS + 40
      )
      return () => window.clearTimeout(id)
    }
  }, [isCanvas, shouldReduceMotion])

  /** Canvas mode: close schedule-only surfaces so one shell can morph. */
  useEffect(() => {
    if (!isCanvas) return
    exitDateSearchMode(true)
    setBulkPicker(null)
  }, [isCanvas, exitDateSearchMode])

  useEffect(() => {
    if (!isCanvas || !expanded) return
    setExpanded(false)
    setInitialData(null)
    onEditDone?.()
  }, [isCanvas, expanded, onEditDone])

  useEffect(() => {
    const on = Boolean(bulkSelection)
    if (on && !bulkWasActiveRef.current) {
      exitDateSearchMode()
    }
    bulkWasActiveRef.current = on
    if (!on) setBulkPicker(null)
  }, [bulkSelection, exitDateSearchMode])

  const confirmGoToDate = useCallback(() => {
    if (parsedDate) {
      onGoToDate?.(parsedDate)
      exitDateSearchMode()
    }
  }, [parsedDate, onGoToDate, exitDateSearchMode])

  // Handle external open requests (e.g. from drag-create)
  useEffect(() => {
    if (!externalOpen || isCanvas) return
    setInitialData(externalOpen)
    setEditorKey((k) => k + 1)
    setMountEditor(true)
    setExpanded(true)
    onExternalOpenHandled?.()
  }, [externalOpen, onExternalOpenHandled, isCanvas])

  // Handle edit mode open (double-click on event)
  useEffect(() => {
    if (!editingTask || isCanvas) return
    setEditorKey((k) => k + 1)
    setMountEditor(true)
    setExpanded(true)
  }, [editingTask, isCanvas])

  const handleClose = useCallback(() => {
    setExpanded(false)
    setInitialData(null)
    onEditDone?.()
  }, [onEditDone])

  const openNewTaskEditor = useCallback(() => {
    if (isCanvas) return
    onEditorOpen?.()
    setInitialData({ noDuration: true })
    setEditorKey((k) => k + 1)
    setMountEditor(true)
    setExpanded(true)
  }, [isCanvas, onEditorOpen])

  // ESC to collapse or exit date search; clear edit state when closing so next open is create mode
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (bulkPicker != null) {
          setBulkPicker(null)
          return
        }
        if (bulkSelection) {
          bulkSelection.onExit()
          return
        }
        if (dateSearchExitPhase !== "inactive") {
          exitDateSearchMode(true)
        } else if (dateSearchMode) {
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
      // Shift+T — same as "Add new" (schedule surface only)
      if (
        e.shiftKey &&
        (e.key === "t" || e.key === "T") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const target = e.target as HTMLElement
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        ) {
          return
        }
        if (
          expanded ||
          dateSearchMode ||
          dateSearchExitPhase !== "inactive" ||
          bulkSelection ||
          bulkPicker != null ||
          isCanvas
        )
          return
        e.preventDefault()
        openNewTaskEditor()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [
    expanded,
    dateSearchMode,
    dateSearchExitPhase,
    parsedDate,
    exitDateSearchMode,
    confirmGoToDate,
    bulkSelection,
    bulkPicker,
    onEditDone,
    openNewTaskEditor,
    isCanvas,
  ])

  // Measure expanded content height after it renders
  useEffect(() => {
    if (expanded && mountEditor && contentRef.current) {
      const measure = () => {
        if (contentRef.current) {
          const h = contentRef.current.scrollHeight
          if (h > 0) setExpandedHeight(h)
        }
      }
      requestAnimationFrame(measure)
    }
  }, [expanded, mountEditor])

  const measureCollapsedStripWidths = useCallback(() => {
    const iw = idleStripMeasureRef.current?.getBoundingClientRect().width ?? 0
    const bw = bulkStripMeasureRef.current?.getBoundingClientRect().width ?? 0
    const cw = canvasStripMeasureRef.current?.getBoundingClientRect().width ?? 0
    const dw = dateStripMeasureRef.current?.getBoundingClientRect().width ?? 0
    if (iw > 0) setIdleStripW(Math.ceil(iw))
    if (bw > 0) setBulkStripW(Math.ceil(bw))
    if (cw > 0) setCanvasStripW(Math.ceil(cw))
    if (dw > 0) setDateStripW(Math.ceil(dw))
  }, [])

  const bulkActive = Boolean(bulkSelection)
  /** Longhand only — React warns if `transition` shorthand is mixed with `transitionDelay`. */
  const collapsedFaceOpacityDurationMs = expanded || bulkActive ? SHELL_OPEN_MS : SHELL_CLOSE_MS

  const idleFaceVisible = !isCanvas && !expanded && !bulkActive
  const bulkFaceVisible = !isCanvas && !expanded && bulkActive

  const idleFaceOpacityStyle = useMemo((): CSSProperties => {
    if (shouldReduceMotion) return { transition: "none" }
    const delayMs =
      idleFaceVisible && scheduleRevealDelayMs > 0 ? scheduleRevealDelayMs : 0
    return {
      transitionProperty: "opacity",
      transitionDuration: `${collapsedFaceOpacityDurationMs}ms`,
      transitionTimingFunction: SHELL_BEZIER_CSS,
      transitionDelay: `${delayMs}ms`,
    }
  }, [
    shouldReduceMotion,
    collapsedFaceOpacityDurationMs,
    idleFaceVisible,
    scheduleRevealDelayMs,
  ])

  const bulkFaceOpacityStyle = useMemo((): CSSProperties => {
    if (shouldReduceMotion) return { transition: "none" }
    const delayMs =
      bulkFaceVisible && scheduleRevealDelayMs > 0 ? scheduleRevealDelayMs : 0
    return {
      transitionProperty: "opacity",
      transitionDuration: `${collapsedFaceOpacityDurationMs}ms`,
      transitionTimingFunction: SHELL_BEZIER_CSS,
      transitionDelay: `${delayMs}ms`,
    }
  }, [
    shouldReduceMotion,
    collapsedFaceOpacityDurationMs,
    bulkFaceVisible,
    scheduleRevealDelayMs,
  ])
  const bulkFaceModel = bulkSelection ?? BULK_FACE_LAYOUT_STUB

  /**
   * Entering date mode: delay date strip fade-in (idle hides immediately). Exiting date mode:
   * phased filled exit handles timing; empty exit uses immediate idle (delay 0).
   */
  const [idleStripOpacityEnterDelayMs, setIdleStripOpacityEnterDelayMs] = useState(0)
  const [dateStripOpacityEnterDelayMs, setDateStripOpacityEnterDelayMs] = useState(0)
  const prevDateSearchModeRef = useRef(dateSearchMode)

  useLayoutEffect(() => {
    if (shouldReduceMotion) {
      setIdleStripOpacityEnterDelayMs(0)
      setDateStripOpacityEnterDelayMs(0)
      prevDateSearchModeRef.current = dateSearchMode
      return
    }
    const prev = prevDateSearchModeRef.current

    if (prev === false && dateSearchMode === true) {
      setDateStripOpacityEnterDelayMs(SHELL_CLOSE_MS)
      setIdleStripOpacityEnterDelayMs(0)
      prevDateSearchModeRef.current = dateSearchMode
      const id = window.setTimeout(() => setDateStripOpacityEnterDelayMs(0), SHELL_CLOSE_MS * 2)
      return () => window.clearTimeout(id)
    }
    if (prev === true && dateSearchMode === false) {
      setIdleStripOpacityEnterDelayMs(0)
      setDateStripOpacityEnterDelayMs(0)
      prevDateSearchModeRef.current = dateSearchMode
      return
    }
    prevDateSearchModeRef.current = dateSearchMode
  }, [dateSearchMode, shouldReduceMotion])

  useLayoutEffect(() => {
    measureCollapsedStripWidths()
  }, [
    measureCollapsedStripWidths,
    bulkSelection,
    bulkFaceModel.count,
    isCanvas,
    dateSearchMode,
    dateQuery,
    deferDateQueryClear,
    dateSearchExitPhase,
  ])

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => measureCollapsedStripWidths())
    const idleEl = idleStripMeasureRef.current
    const bulkEl = bulkStripMeasureRef.current
    const canvasEl = canvasStripMeasureRef.current
    const dateEl = dateStripMeasureRef.current
    if (idleEl) ro.observe(idleEl)
    if (bulkEl) ro.observe(bulkEl)
    if (canvasEl) ro.observe(canvasEl)
    if (dateEl) ro.observe(dateEl)
    return () => ro.disconnect()
  }, [measureCollapsedStripWidths, appMode])

  const collapsedStripTargetWidth =
    idleStripW > 0 && bulkStripW > 0
      ? bulkActive
        ? bulkStripW
        : idleStripW
      : Math.max(idleStripW, bulkStripW)

  /** Idle strip width — expanded task editor matches this so the shell does not grow with editor content. */
  const idleCommandBarWidth =
    idleStripW > 0 ? idleStripW : Math.max(collapsedStripTargetWidth, 0)

  /** Single shell width: canvas strip, idle, expanded editor, or date-search row. */
  const shellTargetWidth: number | "auto" = isCanvas
    ? canvasStripW > 0
      ? canvasStripW
      : Math.max(collapsedStripTargetWidth, 0)
    : dateSearchMode && !expanded
      ? dateStripW > 0
        ? dateStripW
        : Math.max(collapsedStripTargetWidth, 0)
      : expanded
        ? idleCommandBarWidth
        : collapsedStripTargetWidth

  /**
   * First visible paint uses exact measured widths only (no fallback), so the shell stays hidden until
   * layout refs report real pixels — avoids fallback→measured width creep on load.
   */
  const shellMeasureReady =
    isCanvas
      ? canvasStripW > 0
      : expanded
        ? idleStripW > 0
        : dateSearchMode
          ? dateStripW > 0
          : idleStripW > 0 && bulkStripW > 0

  useEffect(() => {
    if (!shellMeasureReady) return
    if (shellWidthMorphEnabled) return
    const id = window.requestAnimationFrame(() => {
      setShellWidthMorphEnabled(true)
    })
    return () => window.cancelAnimationFrame(id)
  }, [shellMeasureReady, shellWidthMorphEnabled])

  const shellTransition = shouldReduceMotion
    ? { duration: 0 }
    : {
        duration: expanded ? SHELL_OPEN_S : SHELL_CLOSE_S,
        ease: CADENCE_EASE_OUT,
      }

  /** Height always morphs when reduced-motion is off; width skips tween until measured + post-mount (see `shellMeasureReady`, `shellWidthMorphEnabled`). */
  const shellMotionTransition =
    shouldReduceMotion
      ? { duration: 0 }
      : {
          height: shellTransition,
          width:
            shellWidthMorphEnabled && shellMeasureReady
              ? shellTransition
              : { duration: 0 },
        }

  const shellOpacityTransition = shouldReduceMotion
    ? "none"
    : `opacity ${expanded ? SHELL_OPEN_MS : SHELL_CLOSE_MS}ms ${SHELL_BEZIER_CSS}`

  const dateSuggestionRowVisible =
    Boolean(dateQuery.trim()) && (dateSearchMode || deferDateQueryClear)

  /** Tall shell only while date search is active (morph to idle height as soon as mode ends). */
  const scheduleShellTallForDateSuggestion =
    Boolean(dateQuery.trim()) && dateSearchMode

  const collapsedScheduleInnerMinHeight = scheduleShellTallForDateSuggestion
    ? COLLAPSED_HEIGHT + 56
    : COLLAPSED_HEIGHT

  const dateSearchStripSemanticallyVisible =
    dateSearchMode ||
    dateSearchExitPhase === "filled-exit-morph" ||
    (deferDateQueryClear && Boolean(dateQuery.trim()))

  const idleScheduleOpacityEnterDelayMs =
    shouldReduceMotion || dateSearchMode || dateSearchExitPhase !== "inactive"
      ? 0
      : idleStripOpacityEnterDelayMs

  const idleScheduleFaceStyle: CSSProperties = (() => {
    if (shouldReduceMotion) {
      return { opacity: dateSearchMode ? 0 : 1, transition: "none" }
    }
    if (dateSearchExitPhase === "filled-exit-morph") {
      return {
        opacity: 1,
        transitionProperty: "opacity",
        transitionDuration: `${FILLED_EXIT_IDLE_FADE_MS}ms`,
        transitionTimingFunction: SHELL_BEZIER_CSS,
        transitionDelay: `${FILLED_EXIT_IDLE_DELAY_MS}ms`,
      }
    }
    return {
      opacity: dateSearchMode ? 0 : 1,
      transitionProperty: "opacity",
      transitionDuration: `${SHELL_CLOSE_MS}ms`,
      transitionTimingFunction: SHELL_BEZIER_CSS,
      transitionDelay: `${idleScheduleOpacityEnterDelayMs}ms`,
    }
  })()

  const dateSearchFaceStyle: CSSProperties = (() => {
    if (shouldReduceMotion) {
      return {
        opacity: dateSearchMode ? 1 : 0,
        transform: "translateX(0) scale(1)",
        transition: "none",
      }
    }
    if (dateSearchExitPhase === "filled-exit-morph") {
      return {
        opacity: 0,
        transform: `translateX(-${DATE_SEARCH_EXIT_NUDGE_PX}px) scale(0.98)`,
        transitionProperty: "opacity, transform",
        transitionDuration: `${FILLED_EXIT_DATE_FACE_MS}ms`,
        transitionTimingFunction: SHELL_BEZIER_CSS,
        transitionDelay: "0ms",
      }
    }
    if (dateSearchMode) {
      return {
        opacity: 1,
        transform: "translateX(0) scale(1)",
        transitionProperty: "opacity, transform",
        transitionDuration: `${SHELL_CLOSE_MS}ms`,
        transitionTimingFunction: SHELL_BEZIER_CSS,
        transitionDelay: `${dateStripOpacityEnterDelayMs}ms`,
      }
    }
    return {
      opacity: 0,
      transform: "translateX(0) scale(1)",
      transitionProperty: "opacity, transform",
      transitionDuration: `${SHELL_CLOSE_MS}ms`,
      transitionTimingFunction: SHELL_BEZIER_CSS,
      transitionDelay: "0ms",
    }
  })()

  const collapsedStripMotionTransition = shouldReduceMotion || expanded
    ? { duration: 0 }
    : {
        duration: bulkActive ? SHELL_OPEN_S : SHELL_CLOSE_S,
        ease: CADENCE_EASE_OUT,
      }

  const collapsedStripMotionTransitionResolved =
    shouldReduceMotion || expanded || !shellWidthMorphEnabled || !shellMeasureReady
      ? { duration: 0 }
      : collapsedStripMotionTransition

  const handleShellAnimationComplete = useCallback(() => {
    if (!expanded) setMountEditor(false)
  }, [expanded])

  const handleCanvasFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !onAddCanvasImageFile) return
      onAddCanvasImageFile(file)
      e.target.value = ""
    },
    [onAddCanvasImageFile]
  )

  const shell = (
    <>
      <motion.div
        className="pointer-events-auto relative max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border/50 bg-secondary shadow-sm"
        style={{
          transformOrigin: "0% 100%",
          opacity: shellMeasureReady ? 1 : 0,
          pointerEvents: shellMeasureReady ? "auto" : "none",
        }}
        initial={false}
        animate={{
          height: isCanvas
            ? COLLAPSED_HEIGHT
            : expanded
              ? expandedHeight
              : scheduleShellTallForDateSuggestion
                ? COLLAPSED_HEIGHT + 56 // Add space for suggestion row
                : COLLAPSED_HEIGHT,
          width: shellTargetWidth,
        }}
        transition={shellMotionTransition}
        onAnimationComplete={handleShellAnimationComplete}
      >
        {/* Expanded content */}
        <div
          ref={contentRef}
          className={cn(
            expanded
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none absolute inset-x-0 top-0 opacity-0"
          )}
          style={{ transition: shellOpacityTransition }}
        >
          {mountEditor && (
            <TaskEditorPanel
              key={editorKey}
              onClose={handleClose}
              onSave={onTaskSave}
              onEditSave={onEditSave}
              initialData={initialData}
              editingTask={editingTask}
              projects={projects}
            />
          )}
        </div>

        {/* Collapsed idle + bulk + date search: dual-layer opacity crossfade; strips stay mounted for measurement. */}
        {!expanded && !isCanvas && (
          <div
            className="relative shrink-0"
            style={{ minHeight: collapsedScheduleInnerMinHeight }}
          >
          <motion.div
            className="relative shrink-0 overflow-hidden"
            style={{
              height: COLLAPSED_HEIGHT,
              ...idleScheduleFaceStyle,
              pointerEvents:
                dateSearchMode || dateSearchExitPhase === "filled-exit-morph"
                  ? "none"
                  : "auto",
            }}
            initial={false}
            animate={{ width: collapsedStripTargetWidth }}
            transition={collapsedStripMotionTransitionResolved}
          >
            <div
              ref={idleStripMeasureRef}
              className={cn(
                "absolute left-0 top-0 flex w-max items-center justify-center gap-1 px-4",
                idleFaceVisible ? "pointer-events-auto" : "pointer-events-none"
              )}
              style={{
                height: COLLAPSED_HEIGHT,
                opacity: idleFaceVisible ? 1 : 0,
                ...idleFaceOpacityStyle,
              }}
              aria-hidden={!idleFaceVisible}
            >
              <ShortcutHintWrap
                label="Add new task"
                shortcut={"\u21E7 T"}
                tooltipPosition="above"
                tooltipAlign="end"
                portal
              >
                {({ dismiss }) => (
                  <button
                    type="button"
                    aria-label="Add new task"
                    onClick={() => {
                      dismiss()
                      openNewTaskEditor()
                    }}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add new
                  </button>
                )}
              </ShortcutHintWrap>

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
                onClick={enterDateSearchMode}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Go to date
              </button>
            </div>

            <div
              ref={bulkStripMeasureRef}
              className={cn(
                "absolute left-0 top-0 flex w-max items-center gap-2 px-2",
                bulkFaceVisible && bulkSelection ? "pointer-events-auto" : "pointer-events-none"
              )}
              style={{
                height: COLLAPSED_HEIGHT,
                opacity: bulkFaceVisible ? 1 : 0,
                ...bulkFaceOpacityStyle,
              }}
              aria-hidden={!bulkSelection}
            >
              <button
                type="button"
                onClick={() => bulkFaceModel.onExit()}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:text-text"
                aria-label="Exit multi-select"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <div className="mx-1 h-4 w-px bg-border" />
              <span className="shrink-0 px-0.5 text-[11px] font-medium tabular-nums text-text-muted">
                {bulkFaceModel.count} selected
              </span>
              <button
                type="button"
                onClick={() => bulkFaceModel.onDone()}
                className="flex shrink-0 items-center gap-1 rounded border border-border/50 bg-surface px-2.5 py-1.5 text-[11px] font-medium text-text shadow-sm transition-colors hover:bg-surface-2"
              >
                <Check className="h-3 w-3 text-green-500" />
                Done
              </button>
              <button
                type="button"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setBulkPicker((cur) =>
                    cur?.kind === "project" ? null : { kind: "project", rect }
                  )
                }}
                className="flex shrink-0 items-center gap-1 rounded border border-border/50 bg-surface px-2.5 py-1.5 text-[11px] font-medium text-text shadow-sm transition-colors hover:bg-surface-2"
              >
                <Layers className="h-3 w-3 text-app-accent" />
                Project
              </button>
              <button
                type="button"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setBulkPicker((cur) =>
                    cur?.kind === "priority" ? null : { kind: "priority", rect }
                  )
                }}
                className="flex shrink-0 items-center gap-1 rounded border border-border/50 bg-surface px-2.5 py-1.5 text-[11px] font-medium text-text shadow-sm transition-colors hover:bg-surface-2"
              >
                <img src="/icons/none.svg" alt="" className="h-3 w-3 shrink-0" />
                Priority
              </button>
              <div className="mx-1 h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => bulkFaceModel.onDelete()}
                className="ml-auto flex shrink-0 items-center gap-0.5 rounded px-2 py-1 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
          </motion.div>

          <div
            ref={dateStripMeasureRef}
            className="absolute left-0 top-0 flex w-max max-w-[calc(100vw-2rem)] flex-col"
            style={{
              minHeight: COLLAPSED_HEIGHT,
              pointerEvents: dateSearchMode ? "auto" : "none",
              ...dateSearchFaceStyle,
            }}
            aria-hidden={!dateSearchStripSemanticallyVisible}
          >
            {/* Input row */}
            <div className="flex items-center gap-3 px-4" style={{ height: COLLAPSED_HEIGHT }}>
              <button
                type="button"
                onClick={() => exitDateSearchMode()}
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
                    type="button"
                    onClick={confirmGoToDate}
                    className="group w-full rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium text-text-muted transition-[opacity,transform,colors] duration-200 ease-out hover:bg-background/50 hover:text-text active:scale-[0.995]"
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
          </div>
        )}

        {/* Canvas commands — measure outer box; motion ties row to shell morph (no dead right edge). */}
        <div
          ref={canvasStripMeasureRef}
          className={cn(
            "absolute left-0 top-0 w-max",
            isCanvas ? "pointer-events-auto" : "pointer-events-none"
          )}
          style={{ height: COLLAPSED_HEIGHT }}
        >
          <motion.div
            className="flex h-full w-max items-center justify-center gap-1 px-4"
            initial={false}
            animate={
              shouldReduceMotion
                ? { opacity: isCanvas ? 1 : 0, x: 0 }
                : {
                    opacity: isCanvas ? 1 : 0,
                    x: isCanvas ? 0 : 12,
                  }
            }
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    duration: isCanvas ? SHELL_OPEN_S : SHELL_CLOSE_S,
                    ease: CADENCE_EASE_OUT,
                  }
            }
            aria-hidden={!isCanvas}
          >
            <button
              type="button"
              onClick={onAddCanvasNote}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add note</span>
            </button>
            <motion.div
              className="flex items-center gap-1"
              initial={false}
              animate={{
                x: shouldReduceMotion ? 0 : isCanvas ? 0 : 8,
              }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : {
                      duration: isCanvas ? SHELL_OPEN_S : SHELL_CLOSE_S,
                      ease: CADENCE_EASE_OUT,
                      delay: isCanvas ? 0.05 : 0,
                    }
              }
            >
              <div className="mx-1 h-4 w-px bg-border" />
              <button
                type="button"
                onClick={() => canvasFileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span>Upload image</span>
              </button>
            </motion.div>
          </motion.div>
        </div>

        {bulkPicker?.kind === "project" && bulkSelection && (
          <BulkChooserPopover
            anchorRect={bulkPicker.rect}
            reducedMotion={!!shouldReduceMotion}
            onClose={() => setBulkPicker(null)}
          >
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  bulkSelection.onProject(p.id)
                  setBulkPicker(null)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text transition-colors hover:bg-surface-2"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </BulkChooserPopover>
        )}

        {bulkPicker?.kind === "priority" && bulkSelection && (
          <BulkChooserPopover
            anchorRect={bulkPicker.rect}
            reducedMotion={!!shouldReduceMotion}
            onClose={() => setBulkPicker(null)}
          >
            {priorityOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  bulkSelection.onPriority(opt.value)
                  setBulkPicker(null)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text capitalize transition-colors hover:bg-surface-2"
              >
                <img src={`/icons/${opt.icon}`} alt="" className="h-3.5 w-3.5 shrink-0" />
                {opt.label}
              </button>
            ))}
          </BulkChooserPopover>
        )}

      </motion.div>
      <input
        ref={canvasFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCanvasFileChange}
      />
    </>
  )

  if (dock === "inline") return shell

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex items-end justify-center px-4">
      {shell}
    </div>
  )
}

