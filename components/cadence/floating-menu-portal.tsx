"use client"

import { useCallback, useEffect, useState, type MutableRefObject, type TransitionEvent } from "react"
import type { CSSProperties } from "react"
import {
  CONTEXT_MENU_CLOSE_MS,
  CONTEXT_MENU_OFFSET_PX,
  CONTEXT_MENU_OPEN_MS,
  FLOATING_MENU_CLOSE_MS,
  FLOATING_MENU_EASE_CSS,
  FLOATING_MENU_OPEN_MS,
  TASK_EDITOR_DROPDOWN_CLOSE_MS,
  TASK_EDITOR_DROPDOWN_EXIT_UNMOUNT_FALLBACK_MS,
  TASK_EDITOR_DROPDOWN_OFFSET_PX,
  TASK_EDITOR_DROPDOWN_OPEN_MS,
} from "@/lib/cadence-motion"

/** Sidebar / canvas menus open downward; task editor field dropdowns open upward. */
export type FloatingMenuDirection = "down" | "up"

export const FLOATING_MENU_EXIT_UNMOUNT_FALLBACK_MS = FLOATING_MENU_CLOSE_MS + 100

export function floatingMenuTransformOrigin(direction: FloatingMenuDirection): string {
  return direction === "up" ? "bottom left" : "top left"
}

export function floatingMenuHiddenTransform(direction: FloatingMenuDirection): string {
  return direction === "up" ? "translateY(8px) scale(0.97)" : "translateY(-8px) scale(0.97)"
}

function premiumDropdownHiddenTransform(
  offsetPx: number,
  direction: FloatingMenuDirection
): string {
  return direction === "up"
    ? `translateY(${offsetPx}px) scale(0.97)`
    : `translateY(-${offsetPx}px) scale(0.97)`
}

/** Task editor dropdown hidden state — 6px travel + subtle scale. */
export function taskEditorDropdownHiddenTransform(direction: FloatingMenuDirection): string {
  return premiumDropdownHiddenTransform(TASK_EDITOR_DROPDOWN_OFFSET_PX, direction)
}

/** Contextual menu hidden state — paired with task editor motion. */
export function contextMenuHiddenTransform(direction: FloatingMenuDirection): string {
  return premiumDropdownHiddenTransform(CONTEXT_MENU_OFFSET_PX, direction)
}

export { TASK_EDITOR_DROPDOWN_EXIT_UNMOUNT_FALLBACK_MS }

function getPremiumDropdownSurfaceStyle(args: {
  visible: boolean
  transformOrigin: string
  reduceMotion: boolean
  openMs: number
  closeMs: number
  hiddenTransform: string
}): Pick<CSSProperties, "opacity" | "transform" | "transition" | "transformOrigin"> {
  const { visible, transformOrigin, reduceMotion, openMs, closeMs, hiddenTransform } = args
  if (reduceMotion) {
    return {
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) scale(1)" : hiddenTransform,
      transition: "none",
      transformOrigin,
    }
  }
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0) scale(1)" : hiddenTransform,
    transition: visible
      ? `opacity ${openMs}ms ${FLOATING_MENU_EASE_CSS}, transform ${openMs}ms ${FLOATING_MENU_EASE_CSS}`
      : `opacity ${closeMs}ms ${FLOATING_MENU_EASE_CSS}, transform ${closeMs}ms ${FLOATING_MENU_EASE_CSS}`,
    transformOrigin,
  }
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

/** Opacity + transform for task editor field dropdowns (180ms / 145ms). */
export function getTaskEditorDropdownSurfaceStyle(args: {
  visible: boolean
  direction?: FloatingMenuDirection
  transformOrigin: string
  reduceMotion: boolean
}): Pick<CSSProperties, "opacity" | "transform" | "transition" | "transformOrigin"> {
  const { visible, direction = "down", transformOrigin, reduceMotion } = args
  return getPremiumDropdownSurfaceStyle({
    visible,
    transformOrigin,
    reduceMotion,
    openMs: TASK_EDITOR_DROPDOWN_OPEN_MS,
    closeMs: TASK_EDITOR_DROPDOWN_CLOSE_MS,
    hiddenTransform: taskEditorDropdownHiddenTransform(direction),
  })
}

/** Sidebar/canvas contextual menus — same motion as task editor (180ms / 145ms). */
export function getContextMenuSurfaceStyle(args: {
  visible: boolean
  direction?: FloatingMenuDirection
  transformOrigin: string
  reduceMotion: boolean
}): Pick<CSSProperties, "opacity" | "transform" | "transition" | "transformOrigin"> {
  const { visible, direction = "down", transformOrigin, reduceMotion } = args
  return getPremiumDropdownSurfaceStyle({
    visible,
    transformOrigin,
    reduceMotion,
    openMs: CONTEXT_MENU_OPEN_MS,
    closeMs: CONTEXT_MENU_CLOSE_MS,
    hiddenTransform: contextMenuHiddenTransform(direction),
  })
}

/** Schedule enter after hidden first paint (double rAF). Returns cleanup. */
export function scheduleFloatingMenuEnter(
  setVisible: (v: boolean) => void,
  reduceMotion: boolean
): () => void {
  if (reduceMotion) {
    setVisible(true)
    return () => {}
  }
  let innerRaf = 0
  const outerRaf = requestAnimationFrame(() => {
    innerRaf = requestAnimationFrame(() => setVisible(true))
  })
  return () => {
    cancelAnimationFrame(outerRaf)
    if (innerRaf) cancelAnimationFrame(innerRaf)
  }
}

/** Task editor field dropdowns — enter after measured placement (same double rAF). */
export const scheduleTaskEditorDropdownEnter = scheduleFloatingMenuEnter

export function handleFloatingMenuExitTransitionEnd(
  e: TransitionEvent<HTMLElement>,
  args: {
    exitHandledRef: MutableRefObject<boolean>
    shouldStayMounted: boolean
    onUnmount: () => void
  }
) {
  if (e.propertyName !== "opacity" && e.propertyName !== "transform") return
  if (args.exitHandledRef.current) return
  if (args.shouldStayMounted) return
  args.exitHandledRef.current = true
  args.onUnmount()
}

/** First paint hidden, then enter — or skip motion when `reduceMotion`. */
export function useFloatingMenuEnterVisible(reduceMotion: boolean): [boolean, (v: boolean) => void] {
  const [visible, setVisible] = useState(false)
  useEffect(() => scheduleFloatingMenuEnter(setVisible, reduceMotion), [reduceMotion])
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

/** Contextual menus — exit timing paired with `getContextMenuSurfaceStyle`. */
export function useContextMenuRequestClose(
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
    window.setTimeout(() => onClose(), CONTEXT_MENU_CLOSE_MS)
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

/** Contextual menus — exit timing paired with `getContextMenuSurfaceStyle`. */
export function runAfterContextMenuExit(
  reduceMotion: boolean,
  setVisible: (v: boolean) => void,
  onDone: () => void
) {
  if (reduceMotion) {
    onDone()
    return
  }
  setVisible(false)
  window.setTimeout(onDone, CONTEXT_MENU_CLOSE_MS)
}
