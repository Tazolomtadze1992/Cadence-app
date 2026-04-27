"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  CADENCE_EASE_SLIDE,
  TOOLTIP_FOCUS_SHOW_MS,
  TOOLTIP_POINTER_CHAIN_GRACE_MS,
  TOOLTIP_POINTER_SHOW_MS,
} from "@/lib/cadence-motion"

type DismissApi = { dismiss: () => void }

const TOOLTIP_VIEWPORT_PAD = 10
const TOOLTIP_GAP_PX = 8

/** Pointer-driven tooltips currently visible (hover), across all `ShortcutHintWrap` instances. */
let openPointerTooltipCount = 0
/** After the last pointer tooltip closes, chain mode stays on until this time (ms since epoch). */
let pointerTooltipChainGraceUntil = 0

function isPointerTooltipChainActive(): boolean {
  return openPointerTooltipCount > 0 || Date.now() < pointerTooltipChainGraceUntil
}

function registerPointerTooltipOpened(): void {
  openPointerTooltipCount++
  pointerTooltipChainGraceUntil = 0
}

function registerPointerTooltipClosed(): void {
  openPointerTooltipCount = Math.max(0, openPointerTooltipCount - 1)
  if (openPointerTooltipCount === 0) {
    pointerTooltipChainGraceUntil = Date.now() + TOOLTIP_POINTER_CHAIN_GRACE_MS
  }
}

function prefersFinePointerHover(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches
}

function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(pointer: coarse)").matches
}

function ShortcutHintChip({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap rounded border border-border/30 bg-calendar-bg px-2 py-1 text-[11px] text-text shadow-lg">
      <span>{label}</span>
      <span className="rounded border border-border/30 bg-surface/70 px-1.5 py-0.5 text-[10px] text-text-muted">
        {shortcut}
      </span>
    </div>
  )
}

export function ShortcutHintWrap({
  label,
  shortcut,
  tooltipPosition = "above",
  /** Horizontal placement relative to the trigger. `center` matches narrow icon buttons; `end` aligns to the trigger’s trailing edge (e.g. wide text buttons). */
  tooltipAlign = "center",
  className,
  /** When true, tooltip is rendered in `document.body` with fixed positioning (avoids `overflow-hidden` ancestors). */
  portal = false,
  children,
}: {
  label: string
  shortcut: string
  tooltipPosition?: "above" | "below"
  tooltipAlign?: "center" | "end"
  className?: string
  portal?: boolean
  children: ReactNode | ((api: DismissApi) => ReactNode)
}) {
  const [tooltipOpen, setTooltipOpen] = useState(false)
  /** True only for pointer opens while `isPointerTooltipChainActive()` — suppresses Framer enter animation. */
  const [chainedPointerEnter, setChainedPointerEnter] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const tooltipTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.14, ease: CADENCE_EASE_SLIDE }

  const wrapRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const isPointerOverRef = useRef(false)
  const openedViaPointerRef = useRef(false)
  const pointerShowTimerRef = useRef<number | null>(null)
  const focusShowTimerRef = useRef<number | null>(null)

  const clearPointerShowTimer = () => {
    if (pointerShowTimerRef.current != null) {
      window.clearTimeout(pointerShowTimerRef.current)
      pointerShowTimerRef.current = null
    }
  }

  const clearFocusShowTimer = () => {
    if (focusShowTimerRef.current != null) {
      window.clearTimeout(focusShowTimerRef.current)
      focusShowTimerRef.current = null
    }
  }

  const clearAllShowTimers = () => {
    clearPointerShowTimer()
    clearFocusShowTimer()
  }

  const hideTooltipIfPointerOpened = () => {
    setTooltipOpen((wasOpen) => {
      if (wasOpen && openedViaPointerRef.current) {
        registerPointerTooltipClosed()
        openedViaPointerRef.current = false
      }
      return false
    })
  }

  useEffect(() => () => clearAllShowTimers(), [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null
      if (next && el.contains(next)) return
      if (focusShowTimerRef.current != null) {
        window.clearTimeout(focusShowTimerRef.current)
        focusShowTimerRef.current = null
      }
      if (isPointerOverRef.current) return
      hideTooltipIfPointerOpened()
    }
    el.addEventListener("focusout", onFocusOut)
    return () => el.removeEventListener("focusout", onFocusOut)
  }, [])

  useEffect(() => {
    if (!tooltipOpen) setChainedPointerEnter(false)
  }, [tooltipOpen])

  const schedulePointerOpen = () => {
    clearPointerShowTimer()
    if (isPointerTooltipChainActive()) {
      openedViaPointerRef.current = true
      setChainedPointerEnter(true)
      registerPointerTooltipOpened()
      setTooltipOpen(true)
      return
    }
    setChainedPointerEnter(false)
    pointerShowTimerRef.current = window.setTimeout(() => {
      pointerShowTimerRef.current = null
      openedViaPointerRef.current = true
      registerPointerTooltipOpened()
      setTooltipOpen(true)
    }, TOOLTIP_POINTER_SHOW_MS)
  }

  const dismiss = () => {
    clearAllShowTimers()
    if (openedViaPointerRef.current) {
      registerPointerTooltipClosed()
      openedViaPointerRef.current = false
    }
    setTooltipOpen(false)
  }

  const [xNudge, setXNudge] = useState(0)
  const [anchor, setAnchor] = useState<{ cx: number; right: number; top: number; bottom: number } | null>(null)

  const skipEnterMotion = chainedPointerEnter || shouldReduceMotion

  useLayoutEffect(() => {
    if (!portal) return
    if (!tooltipOpen) return

    const read = () => {
      const el = wrapRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setAnchor({
        cx: r.left + r.width / 2,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
      })
    }
    read()
    window.addEventListener("scroll", read, true)
    window.addEventListener("resize", read)
    return () => {
      window.removeEventListener("scroll", read, true)
      window.removeEventListener("resize", read)
    }
  }, [tooltipOpen, portal])

  useEffect(() => {
    if (!tooltipOpen) {
      setXNudge(0)
      return
    }

    const measure = () => {
      const wrap = wrapRef.current
      const tip = tipRef.current
      if (!wrap || !tip) return

      const tipRect = tip.getBoundingClientRect()
      const wrapRect = wrap.getBoundingClientRect()

      const idealLeft =
        tooltipAlign === "end"
          ? wrapRect.right - tipRect.width
          : wrapRect.left + wrapRect.width / 2 - tipRect.width / 2

      const minLeft = TOOLTIP_VIEWPORT_PAD
      const maxLeft = window.innerWidth - TOOLTIP_VIEWPORT_PAD - tipRect.width
      const clampedLeft = Math.min(Math.max(idealLeft, minLeft), maxLeft)

      setXNudge(clampedLeft - idealLeft)
    }

    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure)
    })

    window.addEventListener("resize", measure)
    if (portal) window.addEventListener("scroll", measure, true)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.removeEventListener("resize", measure)
      if (portal) window.removeEventListener("scroll", measure, true)
    }
  }, [tooltipOpen, portal, tooltipAlign, anchor?.cx, anchor?.right, anchor?.top, anchor?.bottom])

  const portaledTooltip =
    portal &&
    typeof document !== "undefined" &&
    createPortal(
      <AnimatePresence>
        {tooltipOpen && (
          <motion.div
            key="shortcut-hint-portal"
            initial={skipEnterMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tooltipTransition}
            className="pointer-events-none fixed z-[100]"
            style={{
              left: tooltipAlign === "end" ? anchor?.right ?? 0 : anchor?.cx ?? 0,
              top:
                tooltipPosition === "above"
                  ? (anchor?.top ?? 0) - TOOLTIP_GAP_PX
                  : (anchor?.bottom ?? 0) + TOOLTIP_GAP_PX,
            }}
          >
            {/* Positioning transform lives here so Framer `y` on a child cannot overwrite it (that bug drew the tooltip on top of the trigger). */}
            <div
              ref={tipRef}
              style={{
                transform:
                  tooltipAlign === "end"
                    ? `translate(calc(-100% + ${xNudge}px), ${tooltipPosition === "above" ? "-100%" : "0"})`
                    : `translate(calc(-50% + ${xNudge}px), ${tooltipPosition === "above" ? "-100%" : "0"})`,
              }}
            >
              <motion.div
                initial={skipEnterMotion ? false : { y: tooltipPosition === "above" ? 6 : -6 }}
                animate={{ y: 0 }}
                exit={{ y: tooltipPosition === "above" ? 6 : -6 }}
                transition={tooltipTransition}
              >
                <ShortcutHintChip label={label} shortcut={shortcut} />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )

  return (
    <>
      <div
        ref={wrapRef}
        className={cn("relative", className)}
        onMouseEnter={() => {
          isPointerOverRef.current = true
          clearFocusShowTimer()
          if (!prefersFinePointerHover()) return
          schedulePointerOpen()
        }}
        onMouseLeave={() => {
          isPointerOverRef.current = false
          clearPointerShowTimer()
          requestAnimationFrame(() => {
            const el = wrapRef.current
            if (!el) return
            if (el.contains(document.activeElement)) return
            hideTooltipIfPointerOpened()
          })
        }}
        onFocusCapture={(e) => {
          const target = e.target as HTMLElement | null
          if (!target || !wrapRef.current?.contains(target)) return
          clearPointerShowTimer()
          if (isCoarsePointer()) return
          if (typeof target.matches === "function" && !target.matches(":focus-visible")) return
          clearFocusShowTimer()
          focusShowTimerRef.current = window.setTimeout(() => {
            focusShowTimerRef.current = null
            openedViaPointerRef.current = false
            setChainedPointerEnter(false)
            setTooltipOpen(true)
          }, TOOLTIP_FOCUS_SHOW_MS)
        }}
      >
        {typeof children === "function" ? children({ dismiss }) : children}

        {!portal && (
          <AnimatePresence>
            {tooltipOpen && (
              <motion.div
                ref={tipRef}
                initial={skipEnterMotion ? false : { opacity: 0, y: tooltipPosition === "above" ? 6 : -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: tooltipPosition === "above" ? 6 : -6 }}
                transition={tooltipTransition}
                className={cn(
                  "pointer-events-none absolute z-50",
                  tooltipPosition === "above" ? "bottom-full mb-2" : "top-full mt-2",
                  tooltipAlign === "end" ? "right-0" : "left-1/2"
                )}
                style={
                  tooltipAlign === "end"
                    ? { transform: `translateX(${xNudge}px)` }
                    : { left: "50%", transform: `translateX(calc(-50% + ${xNudge}px))` }
                }
              >
                <ShortcutHintChip label={label} shortcut={shortcut} />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
      {portaledTooltip}
    </>
  )
}

interface IconTooltipButtonProps {
  iconUrl: string
  label: string
  shortcut: string
  isActive?: boolean
  onClick: () => void
  tooltipPosition?: "above" | "below"
  tooltipAlign?: "center" | "end"
  className?: string

  // Optional: keep icon color primary even when inactive (useful for collapse button)
  alwaysPrimary?: boolean
}

export function IconTooltipButton({
  iconUrl,
  label,
  shortcut,
  isActive = false,
  onClick,
  tooltipPosition = "above",
  tooltipAlign = "center",
  className,
  alwaysPrimary = false,
}: IconTooltipButtonProps) {
  return (
    <ShortcutHintWrap
      label={label}
      shortcut={shortcut}
      tooltipPosition={tooltipPosition}
      tooltipAlign={tooltipAlign}
    >
      {({ dismiss }) => (
        <button
          onClick={() => {
            dismiss()
            onClick()
          }}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-sm transition-colors",
            isActive
              ? "bg-background text-primary"
              : alwaysPrimary
                ? "text-primary hover:bg-surface-2"
                : "text-text-muted hover:text-text hover:bg-surface-2",
            className
          )}
        >
          <span
            className="block h-5 w-5"
            style={{
              backgroundColor: "currentColor",
              WebkitMaskImage: `url(${iconUrl})`,
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskImage: `url(${iconUrl})`,
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
            }}
            aria-hidden="true"
          />
        </button>
      )}
    </ShortcutHintWrap>
  )
}
