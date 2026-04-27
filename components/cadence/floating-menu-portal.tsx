"use client"

import { useCallback, useEffect, useState } from "react"
import type { CSSProperties } from "react"
import {
  FLOATING_MENU_CLOSE_MS,
  FLOATING_MENU_EASE_CSS,
  FLOATING_MENU_OPEN_MS,
} from "@/lib/cadence-motion"

/** Sidebar / canvas menus open downward; task editor field dropdowns open upward. */
export type FloatingMenuDirection = "down" | "up"

export function floatingMenuHiddenTransform(direction: FloatingMenuDirection): string {
  return direction === "up" ? "translateY(4px) scale(0.98)" : "translateY(-4px) scale(0.98)"
}

/**
 * Opacity + transform + transition for portaled floating menus (paired with
 * `visible` toggled after mount for enter, and `false` before unmount for exit).
 */
export function getFloatingMenuSurfaceStyle(args: {
  visible: boolean
  direction?: FloatingMenuDirection
  transformOrigin: string
  reduceMotion: boolean
}): Pick<CSSProperties, "opacity" | "transform" | "transition" | "transformOrigin"> {
  const { visible, direction = "down", transformOrigin, reduceMotion } = args
  const hidden = floatingMenuHiddenTransform(direction)
  if (reduceMotion) {
    return {
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) scale(1)" : hidden,
      transition: "none",
      transformOrigin,
    }
  }
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0) scale(1)" : hidden,
    transition: visible
      ? `opacity ${FLOATING_MENU_OPEN_MS}ms ${FLOATING_MENU_EASE_CSS}, transform ${FLOATING_MENU_OPEN_MS}ms ${FLOATING_MENU_EASE_CSS}`
      : `opacity ${FLOATING_MENU_CLOSE_MS}ms ${FLOATING_MENU_EASE_CSS}, transform ${FLOATING_MENU_CLOSE_MS}ms ${FLOATING_MENU_EASE_CSS}`,
    transformOrigin,
  }
}

/** First paint hidden, then enter — or skip motion when `reduceMotion`. */
export function useFloatingMenuEnterVisible(reduceMotion: boolean): [boolean, (v: boolean) => void] {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (reduceMotion) {
      setVisible(true)
      return
    }
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [reduceMotion])
  return [visible, setVisible]
}

/**
 * Close path: animate out (unless reduced motion), then call `onClose` so the parent unmounts.
 */
export function useFloatingMenuRequestClose(
  onClose: () => void,
  setVisible: (v: boolean) => void,
  reduceMotion: boolean
) {
  return useCallback(() => {
    if (reduceMotion) {
      onClose()
      return
    }
    setVisible(false)
    window.setTimeout(() => onClose(), FLOATING_MENU_CLOSE_MS)
  }, [onClose, reduceMotion, setVisible])
}

/**
 * Run side effects after the exit tween (e.g. rename / delete) while keeping the menu mounted until `onClose`.
 */
export function runAfterFloatingMenuExit(
  reduceMotion: boolean,
  setVisible: (v: boolean) => void,
  onDone: () => void
) {
  if (reduceMotion) {
    onDone()
    return
  }
  setVisible(false)
  window.setTimeout(onDone, FLOATING_MENU_CLOSE_MS)
}
