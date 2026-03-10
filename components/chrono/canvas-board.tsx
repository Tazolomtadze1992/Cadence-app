"use client"

import { useEffect, useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react"
import { CornerDownLeft, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type CanvasItem =
  | {
      id: string
      type: "note"
      x: number
      y: number
      width?: number
      zIndex?: number
      title: string
      body: string
    }
  | {
      id: string
      type: "image"
      x: number
      y: number
      width?: number
      height?: number
      zIndex?: number
      src: string
      alt?: string
    }

export interface CanvasProject {
  id: string
  name: string
  color?: string
  items: CanvasItem[]
}

// Board sizing & item defaults – keep in sync with Tailwind classes below
const BOARD_WIDTH = 2200
const BOARD_HEIGHT = 1400

const DEFAULT_NOTE_WIDTH = 320
const DEFAULT_NOTE_HEIGHT = 140

const DEFAULT_IMAGE_WIDTH = 260
const DEFAULT_IMAGE_HEIGHT = 220
const MIN_IMAGE_WIDTH = 160

interface CanvasBoardProps {
  project: CanvasProject | null
  onItemPositionChange: (projectId: string, itemId: string, x: number, y: number) => void
  onItemUpdate?: (projectId: string, itemId: string, updates: Partial<CanvasItem>) => void
  onUpdateNote?: (projectId: string, itemId: string, updates: { title: string; body: string }) => void
  onResizeImage?: (projectId: string, itemId: string, width: number, height: number) => void
  autoFocusNoteId?: string | null
  onAutoFocusNoteHandled?: () => void
  onViewportChange?: (viewport: {
    scrollLeft: number
    scrollTop: number
    clientWidth: number
    clientHeight: number
  }) => void
  onAddNoteAtPosition?: (projectId: string, x: number, y: number) => void
  onDeleteItem?: (projectId: string, itemId: string) => void
}

type DragState = {
  itemId: string
  offsetX: number
  offsetY: number
}

type ResizeState = {
  itemId: string
  startWidth: number
  startHeight: number
  startX: number
  startY: number
}

function getItemSize(item: CanvasItem) {
  const width =
    item.width ??
    (item.type === "note" ? DEFAULT_NOTE_WIDTH : DEFAULT_IMAGE_WIDTH)
  const height =
    item.type === "note"
      ? DEFAULT_NOTE_HEIGHT
      : item.height ?? DEFAULT_IMAGE_HEIGHT
  return { width, height }
}

function clampPosition(item: CanvasItem, x: number, y: number) {
  const { width, height } = getItemSize(item)
  const maxX = Math.max(0, BOARD_WIDTH - width)
  const maxY = Math.max(0, BOARD_HEIGHT - height)
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  }
}

export function CanvasBoard({
  project,
  onItemPositionChange,
  onItemUpdate,
  onUpdateNote,
  onResizeImage,
  autoFocusNoteId,
  onAutoFocusNoteHandled,
  onViewportChange,
  onAddNoteAtPosition,
  onDeleteItem,
}: CanvasBoardProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [resize, setResize] = useState<ResizeState | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
   const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [editingBody, setEditingBody] = useState("")

  // Clear any in-progress editing when switching projects
  useEffect(() => {
    setEditingId(null)
  }, [project?.id])

  const bringItemToFront = (itemId: string) => {
    if (!project || !onItemUpdate) return
    const maxZ = Math.max(0, ...project.items.map((i) => i.zIndex ?? 0))
    const current = project.items.find((i) => i.id === itemId)?.zIndex ?? 0
    if (current >= maxZ) return
    onItemUpdate(project.id, itemId, { zIndex: maxZ + 1 })
  }

  // Report the current scroll viewport to the parent so new notes
  // can be positioned relative to the visible area.
  useEffect(() => {
    if (!onViewportChange || !scrollRef.current) return
    const el = scrollRef.current

    const emit = () => {
      onViewportChange({
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
      })
    }

    emit()

    const handleScroll = () => emit()
    const handleResize = () => emit()

    el.addEventListener("scroll", handleScroll)
    window.addEventListener("resize", handleResize)

    return () => {
      el.removeEventListener("scroll", handleScroll)
      window.removeEventListener("resize", handleResize)
    }
  }, [onViewportChange])

  // When a note is created from the command bar, auto-focus it into edit mode.
  useEffect(() => {
    if (!project || !autoFocusNoteId) return
    const note = project.items.find(
      (item): item is CanvasItem & { type: "note" } =>
        item.id === autoFocusNoteId && item.type === "note"
    )
    if (!note) return
    setSelectedId(note.id)
    setEditingId(note.id)
    setEditingTitle(note.title)
    setEditingBody(note.body)
    onAutoFocusNoteHandled?.()
  }, [project, autoFocusNoteId, onAutoFocusNoteHandled])

  const finishEdit = (commit: boolean) => {
    if (!editingId || !project) {
      setEditingId(null)
      return
    }
    if (commit && onUpdateNote) {
      onUpdateNote(project.id, editingId, {
        title: editingTitle.trim(),
        body: editingBody.trim(),
      })
    }
    setEditingId(null)
  }

  useEffect(() => {
    if (!drag || !project) return

    let frameId: number | null = null
    let lastEvent: PointerEvent | null = null

    function handleMove(e: PointerEvent) {
      const board = boardRef.current
      if (!board) return
      lastEvent = e
      if (frameId != null) return

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        if (!lastEvent || !drag || !project) return
        const currentBoard = boardRef.current
        if (!currentBoard) return
        const rect = currentBoard.getBoundingClientRect()
        const item = project.items.find((it) => it.id === drag.itemId)
        if (!item) return
        const rawX = lastEvent.clientX - rect.left - drag.offsetX
        const rawY = lastEvent.clientY - rect.top - drag.offsetY
        const { x, y } = clampPosition(item, rawX, rawY)
        onItemPositionChange(project.id, drag.itemId, x, y)
      })
    }

    function handleUp() {
      setDrag(null)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
      if (frameId != null) window.cancelAnimationFrame(frameId)
    }
  }, [drag, project, onItemPositionChange])

  const handlePointerDown = (e: React.PointerEvent, item: CanvasItem) => {
    if (e.button !== 0) return
    // Avoid starting a drag when the user is double clicking for edit
    if (e.detail > 1) return
    e.stopPropagation()
    setSelectedId(item.id)
    bringItemToFront(item.id)
    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const offsetX = e.clientX - rect.left - item.x
    const offsetY = e.clientY - rect.top - item.y
    setDrag({ itemId: item.id, offsetX, offsetY })
  }

  const handleNoteDoubleClick = (e: React.MouseEvent, item: CanvasItem & { type: "note" }) => {
    e.stopPropagation()
    if (!project) return
    setSelectedId(item.id)
    bringItemToFront(item.id)
    setEditingId(item.id)
    setEditingTitle(item.title)
    setEditingBody(item.body)
  }
  const handleDeleteItem = (itemId: string) => {
    if (!project || !onDeleteItem) return
    onDeleteItem(project.id, itemId)
    if (selectedId === itemId) setSelectedId(null)
    if (editingId === itemId) setEditingId(null)
    if (hoveredId === itemId) setHoveredId(null)
    if (resize?.itemId === itemId) setResize(null)
  }


  const handleEditKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      finishEdit(false)
    } else if (e.key === "Enter") {
      e.preventDefault()
      finishEdit(true)
    }
  }

  const handleBoardDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!project || !onAddNoteAtPosition) return
    const target = e.target as HTMLElement | null
    if (target && target.closest("[data-canvas-item]")) return

    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()

    const noteWidth = DEFAULT_NOTE_WIDTH
    const noteHeight = DEFAULT_NOTE_HEIGHT

    let x = e.clientX - rect.left - noteWidth / 2
    let y = e.clientY - rect.top - noteHeight / 2

    const maxX = Math.max(0, BOARD_WIDTH - noteWidth)
    const maxY = Math.max(0, BOARD_HEIGHT - noteHeight)
    if (x < 0) x = 0
    else if (x > maxX) x = maxX
    if (y < 0) y = 0
    else if (y > maxY) y = maxY

    onAddNoteAtPosition(project.id, x, y)
  }

  // Keyboard delete for selected item
  useEffect(() => {
    if (!project || !onDeleteItem) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return

      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return

      if (!selectedId) return
      handleDeleteItem(selectedId)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [project, selectedId, onDeleteItem])

  // Image resize effect
  useEffect(() => {
    if (!resize || !project || !onResizeImage) return

    function handleResizeMove(e: PointerEvent) {
      if (!resize || !project) return
      const dx = e.clientX - resize.startX
      const aspect =
        resize.startHeight === 0 ? 1 : resize.startWidth / resize.startHeight
      let newWidth = resize.startWidth + dx
      if (newWidth < MIN_IMAGE_WIDTH) newWidth = MIN_IMAGE_WIDTH
      let newHeight = newWidth / (aspect || 1)
      if (!Number.isFinite(newHeight) || newHeight <= 0) {
        newHeight = resize.startHeight
      }
      onResizeImage?.(project.id, resize.itemId, newWidth, newHeight)
    }

    function handleResizeUp() {
      setResize(null)
    }

    window.addEventListener("pointermove", handleResizeMove)
    window.addEventListener("pointerup", handleResizeUp)
    return () => {
      window.removeEventListener("pointermove", handleResizeMove)
      window.removeEventListener("pointerup", handleResizeUp)
    }
  }, [resize, project, onResizeImage])

  const renderItem = (item: CanvasItem) => {
    const baseStyle: CSSProperties = {
      left: item.x,
      top: item.y,
      width: item.width ?? DEFAULT_NOTE_WIDTH,
      zIndex: item.zIndex ?? 0,
    }

    const isSelected = selectedId === item.id

    if (item.type === "note") {
      const isEditing = editingId === item.id
      const originalTitle = item.title
      const originalBody = item.body
      const isDirty =
        editingId === item.id &&
        (editingTitle.trim() !== originalTitle.trim() ||
          editingBody.trim() !== originalBody.trim())

      const noteWidth = isEditing ? 320 : DEFAULT_NOTE_WIDTH
      const style = { ...baseStyle, width: noteWidth }

      return (
        <div
          key={item.id}
          data-canvas-item="note"
          className="group absolute cursor-grab select-none active:cursor-grabbing outline-none focus:outline-none transition-all duration-100 ease-out"
          style={style}
          onPointerDown={(e) => handlePointerDown(e, item)}
          onDoubleClick={(e) => handleNoteDoubleClick(e, item)}
        >
          {isEditing ? (
            <div
              className={cn(
                "relative rounded-2xl border border-surface-3/40 bg-secondary px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.08)]",
                "focus-within:border-app-faint/80 focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
              )}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteItem(item.id)
                }}
                className="pointer-events-auto absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/30 text-red-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <input
                autoFocus
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="mb-1 w-full bg-transparent text-sm font-semibold text-text outline-none"
                placeholder="Untitled note"
              />
              <textarea
                value={editingBody}
                onChange={(e) => setEditingBody(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="w-full resize-none bg-transparent text-xs leading-relaxed text-text-muted outline-none"
                rows={4}
                placeholder="Start writing..."
              />
              <div className="mt-3 flex items-center justify-end gap-2 transition-opacity duration-150 ease-out">
                <button
                  type="button"
                  onClick={() => finishEdit(false)}
                  className="flex items-center gap-1.5 rounded border border-border/50 bg-surface-2 px-4 py-2 text-xs font-medium text-text shadow-sm transition-colors hover:bg-surface"
                >
                  Discard
                  <kbd className="ml-1 rounded border border-border/50 bg-background/40 px-1.5 py-0.5 text-[10px] font-medium text-text-faint">
                    ESC
                  </kbd>
                </button>

                <button
                  type="button"
                  disabled={!isDirty}
                  onClick={() => isDirty && finishEdit(true)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-4 py-2 text-xs font-medium transition-all",
                    isDirty
                      ? "bg-app-accent text-app-accent-foreground shadow-sm hover:brightness-110 hover:shadow-md"
                      : "cursor-not-allowed text-text-faint opacity-50"
                  )}
                >
                  Save note
                  <span
                    className={cn(
                      "ml-1 inline-flex items-center justify-center rounded px-1.5 py-0.5 leading-none",
                      isDirty ? "border border-white/15 bg-white/2" : "border-transparent bg-transparent"
                    )}
                  >
                    <CornerDownLeft className={cn("h-3 w-3", isDirty ? "text-white" : "text-text-faint opacity-60")} />
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "relative rounded-2xl border border-surface-3/40 bg-secondary px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.08)]",
                isSelected && "border-app-faint/80 shadow-[0_2px_6px_rgba(0,0,0,0.10)]"
              )}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteItem(item.id)
                }}
                className="pointer-events-auto absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/30 text-red-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <p className="mb-1 text-sm font-semibold text-text">{item.title}</p>
              <p className="text-xs leading-relaxed text-text-muted whitespace-pre-line">{item.body}</p>
            </div>
          )}
        </div>
      )
    }

    return (
      <div
        key={item.id}
        data-canvas-item="image"
        className="group absolute cursor-grab select-none active:cursor-grabbing outline-none focus:outline-none"
        style={{ ...baseStyle, height: item.height ?? DEFAULT_IMAGE_HEIGHT }}
        onPointerDown={(e) => handlePointerDown(e, item)}
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-3xl border border-surface-3/40 bg-surface/80 shadow-[0_1px_5px_rgba(0,0,0,0.08)]",
            isSelected && "border-app-faint/70 shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
          )}
          onMouseEnter={() => setHoveredId(item.id)}
          onMouseLeave={() => {
            setHoveredId((current) => (current === item.id ? null : current))
          }}
        >
          <img
            src={item.src}
            alt={item.alt ?? ""}
            className="h-full w-full object-cover"
            draggable={false}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleDeleteItem(item.id)
            }}
            className="pointer-events-auto absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-black/30 text-red-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {(() => {
            const isHovered = hoveredId === item.id
            const isResizing = resize?.itemId === item.id
            const showResizeHandle = isHovered || isSelected || isResizing
            if (!showResizeHandle) return null
            return (
            <div
              className="pointer-events-auto absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-[4px] border border-white/60 bg-black/40 cursor-se-resize"
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                e.preventDefault()
                const { width, height } = getItemSize(item)
                setResize({
                  itemId: item.id,
                  startWidth: width,
                  startHeight: height,
                  startX: e.clientX,
                  startY: e.clientY,
                })
              }}
            />
            )
          })()}
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="relative flex flex-1 items-center justify-center bg-calendar-bg">
        <div className="rounded-2xl border border-border/40 bg-surface/80 px-6 py-4 text-center text-sm text-text-muted">
          Select or create a project to see its canvas.
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="relative flex flex-1 overflow-auto bg-calendar-bg rounded-tl-[16px]">
      <div className="relative z-10 flex flex-1 items-stretch justify-center rounded-tl-[16px]">
        <div
          ref={boardRef}
          className={cn(
            "relative mb-10 mt-0 h-[1400px] w-[2200px] rounded-b-[32px] rounded-tr-[32px] rounded-tl-2xl border border-surface-2/30 bg-calendar-bg shadow-[0_40px_160px_rgba(0,0,0,0.85)]",
            "overflow-hidden"
          )}
          onPointerDown={() => {
            setSelectedId(null)
            if (editingId) finishEdit(true)
          }}
          onDoubleClick={handleBoardDoubleClick}
        >
          {project.items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="mb-1.5 text-sm font-medium text-text">Nothing on this canvas yet</p>
              <p className="max-w-xs text-xs leading-relaxed text-text-muted">
                Start by adding a note or placing an image to sketch out this project.
              </p>
            </div>
          ) : (
            project.items.map(renderItem)
          )}
        </div>
      </div>
    </div>
  )
}
