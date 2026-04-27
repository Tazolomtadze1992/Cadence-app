"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import { useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { FLOATING_MENU_CLOSE_MS, FLOATING_MENU_EASE_CSS, FLOATING_MENU_OPEN_MS } from "@/lib/cadence-motion"
import { ProjectColorSwatchGrid, PROJECT_COLORS } from "./project-palette"

export function AddProjectPopover({
  pos,
  existingNames,
  onClose,
  onCreate,
}: {
  pos: { top: number; left: number }
  existingNames: string[]
  onClose: () => void
  onCreate: (name: string, color: string) => void
}) {
  const [name, setName] = useState("")
  const [color, setColor] = useState<string>(PROJECT_COLORS[0] ?? "#94a3b8")
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const reduceMotion = useReducedMotion() ?? false

  useEffect(() => {
    if (reduceMotion) {
      setVisible(true)
      const id = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
    const raf = requestAnimationFrame(() => setVisible(true))
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(id)
    }
  }, [reduceMotion])

  const requestClose = useCallback(() => {
    if (reduceMotion) {
      onClose()
      return
    }
    setVisible(false)
    window.setTimeout(() => onClose(), FLOATING_MENU_CLOSE_MS)
  }, [onClose, reduceMotion])

  const lowerExisting = useMemo(
    () => existingNames.map((n) => n.trim().toLowerCase()).filter(Boolean),
    [existingNames]
  )

  const validate = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) {
        setError("Name cannot be empty")
        return false
      }
      if (lowerExisting.includes(trimmed.toLowerCase())) {
        setError("A project with this name already exists")
        return false
      }
      setError(null)
      return true
    },
    [lowerExisting]
  )

  const handleSave = () => {
    if (!validate(name)) return
    onCreate(name.trim(), color)
  }

  return createPortal(
    <div
      className="fixed z-[120] w-fit rounded-xl border border-border/50 bg-background p-3 shadow-lg motion-reduce:transition-none will-change-transform will-change-opacity"
      style={{
        top: pos.top,
        left: pos.left,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.98)",
        transition: reduceMotion
          ? "none"
          : visible
            ? `opacity ${FLOATING_MENU_OPEN_MS}ms ${FLOATING_MENU_EASE_CSS}, transform ${FLOATING_MENU_OPEN_MS}ms ${FLOATING_MENU_EASE_CSS}`
            : `opacity ${FLOATING_MENU_CLOSE_MS}ms ${FLOATING_MENU_EASE_CSS}, transform ${FLOATING_MENU_CLOSE_MS}ms ${FLOATING_MENU_EASE_CSS}`,
        transformOrigin: "top left",
      }}
    >
      <div className="flex flex-col items-start">
        <div className="mb-2 w-full">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error) validate(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleSave()
              } else if (e.key === "Escape") {
                e.preventDefault()
                requestClose()
              }
            }}
            className="w-[180px] rounded-md border border-border/60 bg-surface-2 px-2 py-1.5 text-xs text-text outline-none placeholder:text-text-muted"
            placeholder="New project"
          />
          {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
        </div>

        <div className="mb-3">
          <ProjectColorSwatchGrid value={color} onChange={setColor} />
        </div>

        <div className="flex w-full items-center justify-end gap-2">
          <button
            type="button"
            onClick={requestClose}
            className="rounded border border-border/50 bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-surface"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!!error || !name.trim()}
            className={cn(
              "rounded px-3 py-1.5 text-[11px] font-medium transition-all",
              !error && name.trim()
                ? "bg-app-accent text-app-accent-foreground shadow-sm hover:brightness-110 hover:shadow-md"
                : "cursor-not-allowed bg-app-accent/30 text-text-faint"
            )}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
